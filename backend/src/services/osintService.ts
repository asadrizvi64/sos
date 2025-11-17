import { db } from '../config/database';
import { osintMonitors, osintResults, workflows } from '../../drizzle/schema';
import { eq, and, desc, lt, sql } from 'drizzle-orm';
import { workflowExecutor } from './workflowExecutor';
import axios from 'axios';
import { alertService } from './alertService';
import { aiService } from './aiService';

// Enhanced logging utility
const log = {
  info: (message: string, meta?: Record<string, any>) => {
    console.log(`[OSINT] [INFO] ${message}`, meta ? JSON.stringify(meta) : '');
  },
  warn: (message: string, meta?: Record<string, any>) => {
    console.warn(`[OSINT] [WARN] ${message}`, meta ? JSON.stringify(meta) : '');
  },
  error: (message: string, error?: any, meta?: Record<string, any>) => {
    const errorDetails = error instanceof Error 
      ? { message: error.message, stack: error.stack, ...error }
      : error;
    console.error(`[OSINT] [ERROR] ${message}`, {
      error: errorDetails,
      ...meta,
    });
  },
  debug: (message: string, meta?: Record<string, any>) => {
    if (process.env.NODE_ENV === 'development') {
      console.debug(`[OSINT] [DEBUG] ${message}`, meta ? JSON.stringify(meta) : '');
    }
  },
};

type OSINTMonitor = typeof osintMonitors.$inferSelect;
type OSINTResult = typeof osintResults.$inferInsert;

class OSINTService {
  private pollingIntervals: Map<string, NodeJS.Timeout> = new Map();
  private isPolling = false;
  
  // Rate limiting: track API calls per source
  private rateLimiters: Map<string, { count: number; resetAt: number }> = new Map();
  
  // Rate limit configuration (calls per minute)
  private readonly RATE_LIMITS: Record<string, number> = {
    twitter: 15,      // Twitter API v2 free tier: 15 requests/15min window
    reddit: 60,       // Reddit: 60 requests/minute
    news: 100,        // NewsAPI: 100 requests/day (free tier)
    github: 30,       // GitHub: 30 requests/minute (unauthenticated), 5000/hour (authenticated)
    web: 10,          // Web scraping: 10 requests/minute (conservative)
    linkedin: 20,     // LinkedIn: 20 requests/minute
    youtube: 100,     // YouTube: 100 requests/100 seconds
    forums: 30,       // Generic forums: 30 requests/minute
  };

  /**
   * Start polling for all active OSINT monitors
   */
  async startPolling(): Promise<void> {
    if (this.isPolling) return;
    this.isPolling = true;

    await this.loadMonitors();
    
    // Reload monitors every 5 minutes to pick up new/updated monitors
    setInterval(() => {
      this.loadMonitors();
    }, 5 * 60 * 1000);
  }

  /**
   * Load and start polling for all active OSINT monitors
   */
  private async loadMonitors(): Promise<void> {
    try {
      let activeMonitors;
      try {
        // Check if osintMonitors table is properly defined
        if (!osintMonitors || typeof osintMonitors === 'undefined') {
          // Silently skip if schema not available - this is expected during initial setup
          return;
        }
        
        // Try using drizzle ORM first
        activeMonitors = await db
          .select()
          .from(osintMonitors)
          .where(eq(osintMonitors.status, 'active'));
      } catch (queryError: any) {
        // Handle table not existing or schema issues
        if (queryError?.code === '42P01' || queryError?.code === '42601' || 
            queryError?.message?.includes('does not exist') ||
            queryError?.message?.includes('Symbol(drizzle:Columns)') ||
            queryError?.message?.includes('Cannot read properties of undefined')) {
          // Silently skip if table doesn't exist or schema issue - this is expected during initial setup
          return;
        }
        log.error('Failed to load OSINT monitors', queryError, {
          code: queryError?.code,
        });
        throw queryError;
      }

      // Stop polling for monitors that are no longer active
      for (const [monitorId, interval] of this.pollingIntervals.entries()) {
        const stillActive = activeMonitors.some(m => m.id === monitorId);
        if (!stillActive) {
          clearInterval(interval);
          this.pollingIntervals.delete(monitorId);
        }
      }

      // Start polling for new/updated monitors
      for (const monitor of activeMonitors) {
        if (!this.pollingIntervals.has(monitor.id)) {
          this.startPollingForMonitor(monitor);
        }
      }
    } catch (error: any) {
      log.error('Error loading OSINT monitors', error);
    }
  }

  /**
   * Start polling for a specific OSINT monitor
   */
  private startPollingForMonitor(monitor: OSINTMonitor): void {
    const schedule = monitor.schedule as { interval?: number } | null;
    const pollInterval = (schedule?.interval || 60) * 60 * 1000; // Default: 60 minutes

    const interval = setInterval(async () => {
      try {
        await this.collectData(monitor);
      } catch (error: any) {
        log.error(`Error collecting data for monitor ${monitor.id}`, error, {
          monitorId: monitor.id,
          monitorName: monitor.name,
          source: monitor.source,
        });
        await this.handleMonitorError(monitor.id, error.message);
      }
    }, pollInterval);

    this.pollingIntervals.set(monitor.id, interval);

    // Run immediately on startup
    this.collectData(monitor).catch((error: any) => {
      log.error(`Error in initial data collection for monitor ${monitor.id}`, error, {
        monitorId: monitor.id,
        monitorName: monitor.name,
        source: monitor.source,
      });
      this.handleMonitorError(monitor.id, error.message);
    });
    
    log.info(`Started polling for monitor`, {
      monitorId: monitor.id,
      monitorName: monitor.name,
      source: monitor.source,
      intervalMinutes: pollInterval / (60 * 1000),
    });
  }

  /**
   * Check and enforce rate limiting for a source
   */
  private async checkRateLimit(source: string): Promise<void> {
    const limit = this.RATE_LIMITS[source] || 30; // Default: 30 requests/minute
    const now = Date.now();
    const windowMs = 60 * 1000; // 1 minute window
    
    const limiter = this.rateLimiters.get(source) || { count: 0, resetAt: now + windowMs };
    
    // Reset if window expired
    if (now >= limiter.resetAt) {
      limiter.count = 0;
      limiter.resetAt = now + windowMs;
    }
    
    // Check if limit exceeded
    if (limiter.count >= limit) {
      const waitTime = limiter.resetAt - now;
      log.warn(`Rate limit exceeded for ${source}`, {
        source,
        limit,
        currentCount: limiter.count,
        waitTimeMs: waitTime,
      });
      await new Promise(resolve => setTimeout(resolve, waitTime));
      // Reset after waiting
      limiter.count = 0;
      limiter.resetAt = Date.now() + windowMs;
    }
    
    // Increment counter
    limiter.count++;
    this.rateLimiters.set(source, limiter);
    
    log.debug(`Rate limit check for ${source}`, {
      source,
      count: limiter.count,
      limit,
      resetAt: new Date(limiter.resetAt).toISOString(),
    });
  }

  /**
   * Collect data from the specified source
   */
  async collectData(monitor: OSINTMonitor): Promise<void> {
    const config = monitor.config as Record<string, any>;
    let results: OSINTResult[] = [];
    const startTime = Date.now();

    try {
      log.info(`Starting data collection for monitor`, {
        monitorId: monitor.id,
        monitorName: monitor.name,
        source: monitor.source,
        organizationId: monitor.organizationId,
      });

      // Check rate limit before collection
      await this.checkRateLimit(monitor.source);

      switch (monitor.source) {
        case 'twitter':
          results = await this.collectFromTwitter(monitor, config);
          break;
        case 'reddit':
          results = await this.collectFromReddit(monitor, config);
          break;
        case 'news':
          results = await this.collectFromNews(monitor, config);
          break;
        case 'github':
          results = await this.collectFromGitHub(monitor, config);
          break;
        case 'web':
          results = await this.collectFromWeb(monitor, config);
          break;
        default:
          throw new Error(`Unsupported source: ${monitor.source}`);
      }
      
      log.info(`Collected ${results.length} results from ${monitor.source}`, {
        monitorId: monitor.id,
        source: monitor.source,
        resultCount: results.length,
        durationMs: Date.now() - startTime,
      });

      // Analyze sentiment if enabled (before filtering)
      const resultsWithSentiment = await this.analyzeSentiment(results, monitor.filters as Record<string, any>);

      // Filter results based on monitor filters (after sentiment analysis)
      const filteredResults = this.filterResults(resultsWithSentiment, monitor.filters as Record<string, any>);

      // Save results to database
      for (const result of filteredResults) {
        await this.saveResult(monitor, result);
      }

      // Update monitor stats
      await db
        .update(osintMonitors)
        .set({
          lastRunAt: new Date(),
          nextRunAt: new Date(Date.now() + ((monitor.schedule as { interval?: number })?.interval || 60) * 60 * 1000),
          resultCount: sql`${osintMonitors.resultCount} + ${filteredResults.length}`,
          errorCount: 0,
          lastError: null,
          updatedAt: new Date(),
        })
        .where(eq(osintMonitors.id, monitor.id));
      
      log.info(`Monitor collection completed successfully`, {
        monitorId: monitor.id,
        source: monitor.source,
        totalResults: results.length,
        filteredResults: filteredResults.length,
        newResults: filteredResults.length,
        durationMs: Date.now() - startTime,
      });

      // Trigger workflow or alert if configured
      if (filteredResults.length > 0) {
        await this.processResults(monitor, filteredResults);
      }
    } catch (error: any) {
      const durationMs = Date.now() - startTime;
      log.error(`Monitor collection failed`, error, {
        monitorId: monitor.id,
        monitorName: monitor.name,
        source: monitor.source,
        durationMs,
        errorMessage: error.message,
        errorCode: error.code,
        errorResponse: error.response?.data,
      });
      await this.handleMonitorError(monitor.id, error.message);
      throw error;
    }
  }

  /**
   * Collect data from Twitter/X
   */
  private async collectFromTwitter(monitor: OSINTMonitor, config: Record<string, any>): Promise<OSINTResult[]> {
    const keywords = config.keywords || [];
    const twitterQuery = config.twitterQuery || '';
    const results: OSINTResult[] = [];

    const bearerToken = process.env.TWITTER_BEARER_TOKEN;
    if (!bearerToken) {
      log.warn('Twitter Bearer Token not configured. Set TWITTER_BEARER_TOKEN environment variable.', {
        monitorId: monitor.id,
      });
      return results;
    }

    try {
      // Build search query
      const queryParts: string[] = [];
      if (keywords.length > 0) {
        queryParts.push(`(${keywords.map((kw: string) => `"${kw}"`).join(' OR ')})`);
      }
      if (twitterQuery) {
        queryParts.push(twitterQuery);
      }
      const query = queryParts.join(' ');

      // Twitter API v2 search endpoint
      const url = 'https://api.twitter.com/2/tweets/search/recent';
      const response = await axios.get(url, {
        headers: {
          'Authorization': `Bearer ${bearerToken}`,
        },
        params: {
          query: query,
          max_results: 10,
          'tweet.fields': 'created_at,author_id,public_metrics,lang',
          'user.fields': 'username,name',
          expansions: 'author_id',
        },
      });

      const tweets = response.data?.data || [];
      const users = (response.data?.includes?.users || []).reduce((acc: Record<string, any>, user: any) => {
        acc[user.id] = user;
        return acc;
      }, {});

      for (const tweet of tweets) {
        const user = users[tweet.author_id];
        results.push({
          monitorId: monitor.id,
          organizationId: monitor.organizationId,
          source: 'twitter',
          sourceId: tweet.id,
          title: null,
          content: tweet.text,
          url: `https://twitter.com/${user?.username || 'unknown'}/status/${tweet.id}`,
          author: user?.username || 'unknown',
          authorUrl: user?.username ? `https://twitter.com/${user.username}` : null,
          publishedAt: new Date(tweet.created_at),
          metadata: {
            authorName: user?.name,
            lang: tweet.lang,
            retweetCount: tweet.public_metrics?.retweet_count || 0,
            likeCount: tweet.public_metrics?.like_count || 0,
            replyCount: tweet.public_metrics?.reply_count || 0,
            quoteCount: tweet.public_metrics?.quote_count || 0,
          },
        });
      }
    } catch (error: any) {
      log.error('Error collecting from Twitter', error, {
        monitorId: monitor.id,
        keywords,
        query,
        statusCode: error.response?.status,
        responseData: error.response?.data,
      });
      if (error.response?.status === 401) {
        throw new Error('Twitter API authentication failed. Check your bearer token.');
      }
      if (error.response?.status === 429) {
        log.warn('Twitter API rate limit exceeded', {
          monitorId: monitor.id,
          retryAfter: error.response?.headers['retry-after'],
        });
        throw new Error('Twitter API rate limit exceeded. Please wait before retrying.');
      }
      throw error;
    }

    return results;
  }

  /**
   * Collect data from Reddit
   */
  private async collectFromReddit(monitor: OSINTMonitor, config: Record<string, any>): Promise<OSINTResult[]> {
    const keywords = config.keywords || [];
    const subreddits = config.subreddits || [];
    const results: OSINTResult[] = [];

    try {
      for (const subreddit of subreddits) {
        const url = `https://www.reddit.com/r/${subreddit}/new.json?limit=25`;
        const response = await axios.get(url, {
          headers: { 'User-Agent': 'SynthralOS/1.0' },
        });

        const posts = response.data?.data?.children || [];
        for (const post of posts) {
          const postData = post.data;
          const content = `${postData.title}\n${postData.selftext || ''}`;
          
          // Check if post matches keywords
          if (keywords.length === 0 || keywords.some((kw: string) => 
            content.toLowerCase().includes(kw.toLowerCase())
          )) {
            results.push({
              monitorId: monitor.id,
              organizationId: monitor.organizationId,
              source: 'reddit',
              sourceId: postData.id,
              title: postData.title,
              content: content.substring(0, 5000), // Limit content length
              url: `https://reddit.com${postData.permalink}`,
              author: postData.author,
              authorUrl: `https://reddit.com/u/${postData.author}`,
              publishedAt: new Date(postData.created_utc * 1000),
              metadata: {
                subreddit: postData.subreddit,
                score: postData.score,
                numComments: postData.num_comments,
                upvoteRatio: postData.upvote_ratio,
              },
            });
          }
        }
      }
    } catch (error: any) {
      log.error('Error collecting from Reddit', error, {
        monitorId: monitor.id,
        keywords,
        subreddits,
        statusCode: error.response?.status,
      });
    }

    return results;
  }

  /**
   * Collect data from News APIs
   */
  private async collectFromNews(monitor: OSINTMonitor, config: Record<string, any>): Promise<OSINTResult[]> {
    const keywords = config.keywords || [];
    const sources = config.sources || [];
    const results: OSINTResult[] = [];

    const newsApiKey = process.env.NEWS_API_KEY;
    if (!newsApiKey) {
      log.warn('News API key not configured. Set NEWS_API_KEY environment variable. Falling back to Google News.', {
        monitorId: monitor.id,
      });
      // Fallback to Google News RSS
      return await this.collectFromGoogleNews(monitor, keywords, sources);
    }

    try {
      const query = keywords.join(' OR ');
      const sourcesParam = sources.length > 0 ? sources.join(',') : undefined;

      const url = 'https://newsapi.org/v2/everything';
      const response = await axios.get(url, {
        params: {
          q: query,
          sources: sourcesParam,
          language: 'en',
          sortBy: 'publishedAt',
          pageSize: 20,
          apiKey: newsApiKey,
        },
      });

      const articles = response.data?.articles || [];
      for (const article of articles) {
        if (!article.title || !article.content) continue;

        results.push({
          monitorId: monitor.id,
          organizationId: monitor.organizationId,
          source: 'news',
          sourceId: article.url || article.title,
          title: article.title,
          content: article.content || article.description || '',
          url: article.url,
          author: article.author || article.source?.name || 'Unknown',
          authorUrl: article.url,
          publishedAt: new Date(article.publishedAt),
          metadata: {
            source: article.source?.name,
            image: article.urlToImage,
          },
        });
      }
    } catch (error: any) {
      log.warn('Error collecting from News API, falling back to Google News', error, {
        monitorId: monitor.id,
        keywords,
        sources,
        statusCode: error.response?.status,
      });
      // Fallback to Google News
      return await this.collectFromGoogleNews(monitor, keywords, sources);
    }

    return results;
  }

  /**
   * Fallback: Collect from Google News RSS
   */
  private async collectFromGoogleNews(monitor: OSINTMonitor, keywords: string[], sources: string[]): Promise<OSINTResult[]> {
    const results: OSINTResult[] = [];
    try {
      const query = keywords.join('+');
      const url = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-US&gl=US&ceid=US:en`;
      
      const response = await axios.get(url, {
        headers: { 'User-Agent': 'SynthralOS/1.0' },
      });

      // Simple RSS parsing (for production, use a proper RSS parser)
      const items = response.data.match(/<item>[\s\S]*?<\/item>/g) || [];
      for (const item of items.slice(0, 10)) {
        const titleMatch = item.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/);
        const linkMatch = item.match(/<link>(.*?)<\/link>/);
        const pubDateMatch = item.match(/<pubDate>(.*?)<\/pubDate>/);
        const descriptionMatch = item.match(/<description><!\[CDATA\[(.*?)\]\]><\/description>/);

        if (titleMatch && linkMatch) {
          // Note: monitorId and organizationId will be set by the caller
          results.push({
            monitorId: monitor.id,
            organizationId: monitor.organizationId,
            source: 'news',
            sourceId: linkMatch[1],
            title: titleMatch[1],
            content: descriptionMatch ? descriptionMatch[1].replace(/<[^>]*>/g, '') : '',
            url: linkMatch[1],
            author: 'Google News',
            authorUrl: null,
            publishedAt: pubDateMatch ? new Date(pubDateMatch[1]) : new Date(),
            metadata: {},
          });
        }
      }
    } catch (error: any) {
      log.error('Error collecting from Google News', error, {
        keywords,
        statusCode: error.response?.status,
      });
    }

    return results;
  }

  /**
   * Collect data from GitHub
   */
  private async collectFromGitHub(monitor: OSINTMonitor, config: Record<string, any>): Promise<OSINTResult[]> {
    const keywords = config.keywords || [];
    const repos = config.repos || [];
    const results: OSINTResult[] = [];

    const githubToken = process.env.GITHUB_TOKEN;
    const headers: Record<string, string> = {
      'User-Agent': 'SynthralOS/1.0',
    };
    if (githubToken) {
      headers['Authorization'] = `token ${githubToken}`;
    }

    try {
      // Search in specific repos if provided
      if (repos.length > 0) {
        for (const repo of repos) {
          const [owner, repoName] = repo.split('/');
          if (!owner || !repoName) continue;

          // Search issues
          const issuesUrl = `https://api.github.com/search/issues`;
          const issuesResponse = await axios.get(issuesUrl, {
            headers,
            params: {
              q: `${keywords.join(' ')} repo:${owner}/${repoName} type:issue`,
              sort: 'updated',
              per_page: 10,
            },
          });

          for (const issue of issuesResponse.data?.items || []) {
            results.push({
              monitorId: monitor.id,
              organizationId: monitor.organizationId,
              source: 'github',
              sourceId: `issue-${issue.id}`,
              title: issue.title,
              content: issue.body || '',
              url: issue.html_url,
              author: issue.user?.login || 'unknown',
              authorUrl: issue.user?.html_url || null,
              publishedAt: new Date(issue.created_at),
              metadata: {
                type: 'issue',
                state: issue.state,
                comments: issue.comments,
                labels: issue.labels?.map((l: any) => l.name) || [],
              },
            });
          }

          // Search commits
          const commitsUrl = `https://api.github.com/repos/${owner}/${repoName}/commits`;
          const commitsResponse = await axios.get(commitsUrl, {
            headers,
            params: {
              per_page: 10,
            },
          });

          for (const commit of commitsResponse.data || []) {
            const commitMessage = commit.commit.message;
            if (keywords.length === 0 || keywords.some((kw: string) => 
              commitMessage.toLowerCase().includes(kw.toLowerCase())
            )) {
              results.push({
                monitorId: monitor.id,
                organizationId: monitor.organizationId,
                source: 'github',
                sourceId: `commit-${commit.sha}`,
                title: commitMessage.split('\n')[0],
                content: commitMessage,
                url: commit.html_url,
                author: commit.commit.author?.name || commit.author?.login || 'unknown',
                authorUrl: commit.author?.html_url || null,
                publishedAt: new Date(commit.commit.author?.date || commit.commit.committer?.date),
                metadata: {
                  type: 'commit',
                  sha: commit.sha.substring(0, 7),
                },
              });
            }
          }
        }
      } else {
        // Global search
        const searchUrl = 'https://api.github.com/search/repositories';
        const searchResponse = await axios.get(searchUrl, {
          headers,
          params: {
            q: keywords.join(' '),
            sort: 'updated',
            per_page: 10,
          },
        });

        for (const repo of searchResponse.data?.items || []) {
          results.push({
            monitorId: monitor.id,
            organizationId: monitor.organizationId,
            source: 'github',
            sourceId: `repo-${repo.id}`,
            title: repo.full_name,
            content: repo.description || '',
            url: repo.html_url,
            author: repo.owner?.login || 'unknown',
            authorUrl: repo.owner?.html_url || null,
            publishedAt: new Date(repo.updated_at),
            metadata: {
              type: 'repository',
              stars: repo.stargazers_count,
              language: repo.language,
            },
          });
        }
      }
    } catch (error: any) {
      log.error('Error collecting from GitHub', error, {
        monitorId: monitor.id,
        keywords,
        repos,
        statusCode: error.response?.status,
        rateLimitRemaining: error.response?.headers['x-ratelimit-remaining'],
        rateLimitReset: error.response?.headers['x-ratelimit-reset'],
      });
      if (error.response?.status === 403) {
        const rateLimitRemaining = error.response?.headers['x-ratelimit-remaining'];
        const rateLimitReset = error.response?.headers['x-ratelimit-reset'];
        log.warn('GitHub API rate limit exceeded', {
          monitorId: monitor.id,
          rateLimitRemaining,
          rateLimitReset: rateLimitReset ? new Date(parseInt(rateLimitReset) * 1000).toISOString() : null,
        });
        throw new Error('GitHub API rate limit exceeded. Consider setting GITHUB_TOKEN.');
      }
      throw error;
    }

    return results;
  }

  /**
   * Collect data from general web sources
   */
  private async collectFromWeb(monitor: OSINTMonitor, config: Record<string, any>): Promise<OSINTResult[]> {
    const urls = config.urls || [];
    const keywords = config.keywords || [];
    const results: OSINTResult[] = [];

    try {
      for (const url of urls) {
        try {
          const response = await axios.get(url, {
            headers: { 'User-Agent': 'SynthralOS/1.0 (OSINT Monitoring)' },
            timeout: 10000,
            maxRedirects: 5,
          });

          // Simple HTML parsing (for production, use cheerio or similar)
          const html = response.data;
          const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
          const title = titleMatch ? titleMatch[1].trim() : url;
          
          // Remove script and style tags, then extract text
          const textContent = html
            .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
            .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
            .replace(/<[^>]+>/g, ' ')
            .replace(/\s+/g, ' ')
            .trim()
            .substring(0, 5000);

          // Check if content matches keywords
          if (keywords.length === 0 || keywords.some((kw: string) => 
            textContent.toLowerCase().includes(kw.toLowerCase())
          )) {
            results.push({
              monitorId: monitor.id,
              organizationId: monitor.organizationId,
              source: 'web',
              sourceId: url,
              title: title,
              content: textContent,
              url: url,
              author: null,
              authorUrl: null,
              publishedAt: new Date(),
              metadata: {
                contentType: response.headers['content-type'],
              },
            });
          }

          // Rate limiting: wait 1 second between requests
          await new Promise(resolve => setTimeout(resolve, 1000));
        } catch (error: any) {
          log.warn(`Error scraping URL`, error, {
            url,
            monitorId: monitor.id,
            statusCode: error.response?.status,
          });
          continue;
        }
      }
    } catch (error: any) {
      log.error('Error collecting from web', error, {
        monitorId: monitor.id,
        urls,
        keywords,
      });
    }

    return results;
  }

  /**
   * Analyze sentiment for results
   */
  private async analyzeSentiment(
    results: OSINTResult[],
    filters: Record<string, any> | null
  ): Promise<OSINTResult[]> {
    // Analyze sentiment if enableSentiment flag is set in filters
    if (!filters || !filters.enableSentiment) {
      return results;
    }

    const resultsWithSentiment = await Promise.all(
      results.map(async (result) => {
        if (result.sentiment) {
          // Already analyzed
          return result;
        }

        try {
          // Use LLM to analyze sentiment
          const prompt = `Analyze the sentiment of the following text and respond with ONLY one word: "positive", "negative", or "neutral".\n\nText: ${result.content.substring(0, 500)}`;
          
          const response = await aiService.generateText({
            prompt,
            config: {
              provider: 'openai',
              model: 'gpt-3.5-turbo',
              temperature: 0.3,
              maxTokens: 10,
            },
          });

          const sentimentText = response.text.trim().toLowerCase();
          let sentiment: 'positive' | 'negative' | 'neutral' = 'neutral';
          let sentimentScore = 0;

          if (sentimentText.includes('positive')) {
            sentiment = 'positive';
            sentimentScore = 50;
          } else if (sentimentText.includes('negative')) {
            sentiment = 'negative';
            sentimentScore = -50;
          } else {
            sentiment = 'neutral';
            sentimentScore = 0;
          }

          return {
            ...result,
            sentiment,
            sentimentScore,
          };
        } catch (error: any) {
          log.warn('Error analyzing sentiment, defaulting to neutral', error, {
            resultId: result.id || 'unknown',
            contentLength: result.content?.length || 0,
          });
          return {
            ...result,
            sentiment: 'neutral' as const,
            sentimentScore: 0,
          };
        }
      })
    );

    return resultsWithSentiment;
  }

  /**
   * Filter results based on monitor filters
   */
  private filterResults(results: OSINTResult[], filters: Record<string, any> | null): OSINTResult[] {
    if (!filters) return results;

    return results.filter(result => {
      // Date range filter
      if (filters.dateRange) {
        const published = new Date(result.publishedAt!);
        if (filters.dateRange.start && published < new Date(filters.dateRange.start)) return false;
        if (filters.dateRange.end && published > new Date(filters.dateRange.end)) return false;
      }

      // Language filter
      if (filters.language && result.metadata?.language !== filters.language) {
        return false;
      }

      // Sentiment filter
      if (filters.sentiment && result.sentiment !== filters.sentiment) {
        return false;
      }

      return true;
    });
  }

  /**
   * Save a result to the database (avoid duplicates)
   */
  private async saveResult(monitor: OSINTMonitor, result: OSINTResult): Promise<void> {
    try {
      // Check if result already exists
      const existing = await db
        .select()
        .from(osintResults)
        .where(
          and(
            eq(osintResults.monitorId, monitor.id),
            eq(osintResults.source, result.source),
            eq(osintResults.sourceId, result.sourceId!)
          )
        )
        .limit(1);

      if (existing.length === 0) {
        await db.insert(osintResults).values(result);
      }
    } catch (error: any) {
      log.error('Error saving OSINT result', error, {
        monitorId: monitor.id,
        sourceId: result.sourceId,
        source: result.source,
      });
    }
  }

  /**
   * Process results (trigger workflows/alerts)
   */
  private async processResults(monitor: OSINTMonitor, results: OSINTResult[]): Promise<void> {
    // Trigger workflow if configured
    if (monitor.workflowId) {
      try {
        const workflow = await db
          .select()
          .from(workflows)
          .where(eq(workflows.id, monitor.workflowId))
          .limit(1);

        if (workflow.length > 0) {
          for (const result of results) {
            await workflowExecutor.execute({
              workflowId: monitor.workflowId,
              definition: workflow[0].definition as any,
              input: { osintResult: result },
            });
          }
        }
      } catch (error) {
        console.error('Error triggering workflow for OSINT monitor:', error);
      }
    }

    // Trigger alert if configured
    if (monitor.alertId) {
      try {
        await alertService.triggerAlert(monitor.alertId, {
          monitorId: monitor.id,
          resultCount: results.length,
          results: results.slice(0, 10), // Include first 10 results
        });
      } catch (error) {
        console.error('Error triggering alert for OSINT monitor:', error);
      }
    }
  }

  /**
   * Handle monitor errors
   */
  private async handleMonitorError(monitorId: string, errorMessage: string): Promise<void> {
    try {
      const [monitor] = await db
        .select()
        .from(osintMonitors)
        .where(eq(osintMonitors.id, monitorId))
        .limit(1);
      
      if (!monitor) {
        log.warn('Monitor not found when handling error', { monitorId });
        return;
      }
      
      const newErrorCount = (monitor.errorCount || 0) + 1;
      const shouldDisable = newErrorCount >= 5; // Disable after 5 consecutive errors
      
      await db
        .update(osintMonitors)
        .set({
          status: shouldDisable ? 'disabled' : 'error',
          lastError: errorMessage,
          errorCount: sql`${osintMonitors.errorCount} + 1`,
          updatedAt: new Date(),
        })
        .where(eq(osintMonitors.id, monitorId));
      
      log.error('Monitor error recorded', new Error(errorMessage), {
        monitorId,
        monitorName: monitor.name,
        source: monitor.source,
        errorCount: newErrorCount,
        disabled: shouldDisable,
      });
      
      if (shouldDisable) {
        log.warn('Monitor automatically disabled due to repeated errors', {
          monitorId,
          monitorName: monitor.name,
          errorCount: newErrorCount,
        });
      }
    } catch (error: any) {
      log.error('Error updating monitor error status', error, { monitorId });
    }
  }

  /**
   * Manually trigger data collection for a monitor
   */
  async triggerCollection(monitorId: string): Promise<void> {
    const monitor = await db
      .select()
      .from(osintMonitors)
      .where(eq(osintMonitors.id, monitorId))
      .limit(1);

    if (monitor.length === 0) {
      throw new Error('Monitor not found');
    }

    await this.collectData(monitor[0]);
  }
}

export const osintService = new OSINTService();

