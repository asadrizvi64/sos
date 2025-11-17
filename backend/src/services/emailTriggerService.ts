import { db } from '../config/database';
import { emailTriggers, workflows } from '../../drizzle/schema';
import { eq, and } from 'drizzle-orm';
import { WorkflowDefinition } from '@sos/shared';
import { workflowExecutor } from './workflowExecutor';
import axios from 'axios';
import { encryptObject, decryptObject } from '../utils/encryption';
import { emailTriggerMonitoring } from './emailTriggerMonitoring';
import { ocrService, OCRInput, OCRConfig } from './ocrService';

interface EmailMessage {
  id: string;
  from: string;
  to: string;
  subject: string;
  body: string;
  html?: string;
  date: Date;
  attachments?: Array<{
    filename: string;
    contentType: string;
    size: number;
    data?: string; // Base64 encoded
  }>;
}

class EmailTriggerService {
  private pollingIntervals: Map<string, NodeJS.Timeout> = new Map();
  private isPolling = false;

  /**
   * Start polling for all active email triggers
   */
  async startPolling(): Promise<void> {
    if (this.isPolling) return;
    this.isPolling = true;

    await this.loadEmailTriggers();
    
    // Reload triggers every 5 minutes to pick up new/updated triggers
    setInterval(() => {
      this.loadEmailTriggers();
    }, 5 * 60 * 1000);
  }

  /**
   * Load and start polling for all active email triggers
   */
  private async loadEmailTriggers(): Promise<void> {
    try {
      let activeTriggers;
      try {
        // Check if emailTriggers table is properly defined
        if (!emailTriggers || typeof emailTriggers === 'undefined') {
          // Silently skip if schema not available - this is expected during initial setup
          return;
        }
        
        activeTriggers = await db
          .select()
          .from(emailTriggers)
          .where(eq(emailTriggers.active, true));
      } catch (queryError: any) {
        // If table doesn't exist or SQL syntax error, silently skip
        if (queryError?.code === '42P01' || queryError?.code === '42601' ||
            queryError?.message?.includes('does not exist') ||
            queryError?.message?.includes('Symbol(drizzle:Columns)') ||
            queryError?.message?.includes('Cannot read properties of undefined')) {
          // Silently skip - this is expected during initial setup
          return;
        }
        throw queryError;
      }

      // Stop polling for triggers that are no longer active
      for (const [triggerId, interval] of this.pollingIntervals.entries()) {
        const stillActive = activeTriggers.some(t => t.id === triggerId);
        if (!stillActive) {
          clearInterval(interval);
          this.pollingIntervals.delete(triggerId);
        }
      }

      // Start polling for new/updated triggers
      for (const trigger of activeTriggers) {
        if (!this.pollingIntervals.has(trigger.id)) {
          this.startPollingForTrigger(trigger);
        }
      }
    } catch (error) {
      console.error('Error loading email triggers:', error);
    }
  }

  /**
   * Start polling for a specific email trigger
   */
  private startPollingForTrigger(trigger: typeof emailTriggers.$inferSelect): void {
    const pollInterval = (trigger.pollInterval || 60) * 1000; // Convert to milliseconds

    const interval = setInterval(async () => {
      try {
        await this.checkForNewEmails(trigger);
      } catch (error) {
        console.error(`Error checking emails for trigger ${trigger.id}:`, error);
      }
    }, pollInterval);

    this.pollingIntervals.set(trigger.id, interval);

    // Do an initial check
    this.checkForNewEmails(trigger).catch((error) => {
      console.error(`Error in initial email check for trigger ${trigger.id}:`, error);
    });
  }

  /**
   * Check for new emails and trigger workflows
   */
  private async checkForNewEmails(trigger: typeof emailTriggers.$inferSelect): Promise<void> {
    try {
      // Decrypt credentials
      let credentials: { accessToken: string; refreshToken?: string };
      try {
        if (typeof trigger.credentials === 'string') {
          // Encrypted credentials (new format)
          credentials = decryptObject(trigger.credentials);
        } else {
          // Plain credentials (legacy format - for migration)
          credentials = trigger.credentials as any;
        }
      } catch (error) {
        console.error(`Error decrypting credentials for trigger ${trigger.id}:`, error);
        return;
      }

      // Refresh token if needed
      credentials = await this.refreshTokenIfNeeded(trigger, credentials);

      let messages: EmailMessage[] = [];

      // Fetch emails based on provider with retry logic
      const maxRetries = 3;
      let retryCount = 0;
      let lastError: Error | null = null;

      while (retryCount < maxRetries) {
        try {
          if (trigger.provider === 'gmail') {
            messages = await this.fetchGmailEmails(trigger, credentials);
          } else if (trigger.provider === 'outlook') {
            messages = await this.fetchOutlookEmails(trigger, credentials);
          } else if (trigger.provider === 'imap') {
            messages = await this.fetchIMAPEmails(trigger, credentials);
          }
          break; // Success, exit retry loop
        } catch (error: any) {
          lastError = error;
          retryCount++;

          // If token expired, try to refresh and retry
          if (error.message === 'TOKEN_EXPIRED' && retryCount < maxRetries) {
            try {
              credentials = await this.refreshTokenIfNeeded(trigger, credentials);
              // Wait before retry (exponential backoff)
              await new Promise((resolve) => setTimeout(resolve, Math.pow(2, retryCount) * 1000));
              continue;
            } catch (refreshError) {
              console.error(`Token refresh failed for trigger ${trigger.id}:`, refreshError);
              break; // Can't refresh, give up
            }
          }

          // For other errors, wait and retry
          if (retryCount < maxRetries) {
            const delay = Math.pow(2, retryCount) * 1000; // Exponential backoff
            console.warn(`Retry ${retryCount}/${maxRetries} for trigger ${trigger.id} after ${delay}ms`);
            await new Promise((resolve) => setTimeout(resolve, delay));
          }
        }
      }

      // If all retries failed, log and return
      if (retryCount >= maxRetries && lastError) {
        console.error(`Failed to fetch emails for trigger ${trigger.id} after ${maxRetries} retries:`, lastError);
        
        // Record failure in monitoring
        const errorType = lastError.message === 'TOKEN_EXPIRED' ? 'token_refresh' : 'api_error';
        emailTriggerMonitoring.recordFailure(trigger.id, lastError, errorType);
        return;
      }

      // Filter messages based on trigger filters
      const filteredMessages = this.filterMessages(messages, trigger.filters as any);

      // Process new messages
      let processedCount = 0;
      let workflowsTriggered = 0;
      
      for (const message of filteredMessages) {
        // Check if we've already processed this message
        if (trigger.lastMessageId === message.id) {
          continue;
        }

        // Get workflow definition
        const [workflow] = await db
          .select()
          .from(workflows)
          .where(eq(workflows.id, trigger.workflowId))
          .limit(1);

        if (!workflow || !workflow.active) {
          continue;
        }

        const definition = workflow.definition as WorkflowDefinition;

        // Process attachments with OCR if they are images or PDFs
        const processedAttachments = await Promise.all(
          (message.attachments || []).map(async (attachment) => {
            const processedAttachment = { ...attachment };
            
            // Check if attachment is image or PDF
            const isImage = attachment.contentType?.startsWith('image/');
            const isPDF = attachment.contentType === 'application/pdf';
            
            if ((isImage || isPDF) && attachment.data) {
              try {
                // Run OCR on attachment
                const ocrInput: OCRInput = isPDF
                  ? { pdfBase64: attachment.data }
                  : { imageBase64: attachment.data };
                
                const ocrConfig: OCRConfig = {
                  provider: 'tesseract', // Use Tesseract by default for email attachments
                  language: 'auto',
                  preprocess: true,
                };
                
                const ocrResult = await ocrService.process(ocrInput, ocrConfig);
                
                // Add OCR results to attachment
                processedAttachment.ocrText = ocrResult.text;
                processedAttachment.ocrConfidence = ocrResult.confidence;
                processedAttachment.ocrMetadata = ocrResult.metadata;
                if (ocrResult.structuredData) {
                  processedAttachment.ocrStructuredData = ocrResult.structuredData;
                }
              } catch (error: any) {
                // If OCR fails, log but don't fail the email processing
                console.warn(`OCR failed for attachment ${attachment.filename}:`, error.message);
                // Attachment still included, just without OCR data
              }
            }
            
            return processedAttachment;
          })
        );

        // Trigger workflow with email data
        await workflowExecutor.executeWorkflow({
          workflowId: trigger.workflowId,
          definition,
          input: {
            email: {
              id: message.id,
              from: message.from,
              to: message.to,
              subject: message.subject,
              body: message.body,
              html: message.html,
              date: message.date.toISOString(),
              attachments: processedAttachments,
            },
            trigger: {
              type: 'email',
              provider: trigger.provider,
              email: trigger.email,
            },
          },
        });

        processedCount++;
        workflowsTriggered++;

        // Update last checked time and last message ID
        await db
          .update(emailTriggers)
          .set({
            lastCheckedAt: new Date(),
            lastMessageId: message.id,
            updatedAt: new Date(),
          })
          .where(eq(emailTriggers.id, trigger.id));
      }
      
      // Record success in monitoring (even if no new messages - successful check)
      emailTriggerMonitoring.recordSuccess(trigger.id, processedCount, workflowsTriggered);
    } catch (error) {
      console.error(`Error checking emails for trigger ${trigger.id}:`, error);
    }
  }

  /**
   * Fetch emails from Gmail using OAuth2
   */
  private async fetchGmailEmails(
    trigger: typeof emailTriggers.$inferSelect,
    credentials: { accessToken: string; refreshToken?: string }
  ): Promise<EmailMessage[]> {
    try {
      // Use Gmail API to fetch messages
      const response = await axios.get(
        'https://www.googleapis.com/gmail/v1/users/me/messages',
        {
          params: {
            q: this.buildGmailQuery(trigger.filters as any),
            maxResults: 10,
          },
          headers: {
            Authorization: `Bearer ${credentials.accessToken}`,
          },
        }
      );

      const messageIds = response.data.messages?.map((m: any) => m.id) || [];
      const messages: EmailMessage[] = [];

      // Fetch full message details
      for (const messageId of messageIds) {
        try {
          const msgResponse = await axios.get(
            `https://www.googleapis.com/gmail/v1/users/me/messages/${messageId}`,
            {
              headers: {
                Authorization: `Bearer ${credentials.accessToken}`,
              },
            }
          );

          const msg = msgResponse.data;
          const payload = msg.payload;
          const headers = payload.headers;

          const from = headers.find((h: any) => h.name === 'From')?.value || '';
          const to = headers.find((h: any) => h.name === 'To')?.value || '';
          const subject = headers.find((h: any) => h.name === 'Subject')?.value || '';
          const date = new Date(headers.find((h: any) => h.name === 'Date')?.value || Date.now());

          // Extract body
          let body = '';
          let html = '';
          if (payload.body?.data) {
            body = Buffer.from(payload.body.data, 'base64').toString();
          } else if (payload.parts) {
            for (const part of payload.parts) {
              if (part.mimeType === 'text/plain' && part.body?.data) {
                body = Buffer.from(part.body.data, 'base64').toString();
              } else if (part.mimeType === 'text/html' && part.body?.data) {
                html = Buffer.from(part.body.data, 'base64').toString();
              }
            }
          }

          messages.push({
            id: msg.id,
            from,
            to,
            subject,
            body,
            html,
            date,
          });
        } catch (error) {
          console.error(`Error fetching Gmail message ${messageId}:`, error);
        }
      }

      return messages;
    } catch (error: any) {
      if (error.response?.status === 401) {
        // Token expired - try to refresh
        console.warn('Gmail OAuth token expired for trigger', trigger.id, '- attempting refresh');
        throw new Error('TOKEN_EXPIRED');
      }
      
      // Check for rate limiting
      if (error.response?.status === 429) {
        const retryAfter = error.response.headers['retry-after'];
        emailTriggerMonitoring.recordRateLimitWarning(trigger.id, 'gmail', retryAfter ? parseInt(retryAfter) : undefined);
      }
      
      throw error;
    }
  }

  /**
   * Fetch emails from Outlook using Microsoft Graph API
   */
  private async fetchOutlookEmails(
    trigger: typeof emailTriggers.$inferSelect,
    credentials: { accessToken: string; refreshToken?: string }
  ): Promise<EmailMessage[]> {
    try {
      const response = await axios.get(
        'https://graph.microsoft.com/v1.0/me/messages',
        {
          params: {
            $filter: this.buildOutlookFilter(trigger.filters as any),
            $top: 10,
            $orderby: 'receivedDateTime desc',
          },
          headers: {
            Authorization: `Bearer ${credentials.accessToken}`,
          },
        }
      );

      const messages: EmailMessage[] = (response.data.value || []).map((msg: any) => ({
        id: msg.id,
        from: msg.from?.emailAddress?.address || '',
        to: msg.toRecipients?.[0]?.emailAddress?.address || '',
        subject: msg.subject || '',
        body: msg.body?.content || '',
        html: msg.body?.contentType === 'html' ? msg.body.content : undefined,
        date: new Date(msg.receivedDateTime),
      }));

      return messages;
    } catch (error: any) {
      if (error.response?.status === 401) {
        // Token expired - try to refresh
        console.warn('Outlook OAuth token expired for trigger', trigger.id, '- attempting refresh');
        throw new Error('TOKEN_EXPIRED');
      }
      
      // Check for rate limiting
      if (error.response?.status === 429) {
        const retryAfter = error.response.headers['retry-after'];
        emailTriggerMonitoring.recordRateLimitWarning(trigger.id, 'outlook', retryAfter ? parseInt(retryAfter) : undefined);
      }
      
      throw error;
    }
  }

  /**
   * Fetch emails from IMAP server
   */
  private async fetchIMAPEmails(
    trigger: typeof emailTriggers.$inferSelect,
    credentials: { host: string; port: number; user: string; password: string; secure?: boolean }
  ): Promise<EmailMessage[]> {
    return new Promise((resolve, reject) => {
      try {
        // Dynamic import to avoid loading imap if not needed
        const Imap = require('imap');
        const { simpleParser } = require('mailparser');

        const imap = new Imap({
          user: credentials.user,
          password: credentials.password,
          host: credentials.host,
          port: credentials.port || (credentials.secure !== false ? 993 : 143),
          tls: credentials.secure !== false,
          tlsOptions: { rejectUnauthorized: false }, // Allow self-signed certificates
        });

        const messages: EmailMessage[] = [];
        let messageCount = 0;
        const maxMessages = 10; // Limit to 10 most recent messages

        imap.once('ready', () => {
          imap.openBox(trigger.folder || 'INBOX', false, (err: Error | null, box: any) => {
            if (err) {
              imap.end();
              reject(err);
              return;
            }

            // Search for unseen messages (or all if we need to check lastMessageId)
            const searchCriteria = trigger.lastMessageId 
              ? ['UNSEEN', ['SINCE', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)]] // Last 7 days
              : ['UNSEEN'];

            imap.search(searchCriteria, (err: Error | null, results: number[]) => {
              if (err) {
                imap.end();
                reject(err);
                return;
              }

              if (!results || results.length === 0) {
                imap.end();
                resolve([]);
                return;
              }

              // Get the most recent messages (limit to maxMessages)
              const fetchResults = results.slice(-maxMessages);

              if (fetchResults.length === 0) {
                imap.end();
                resolve([]);
                return;
              }

              const fetch = imap.fetch(fetchResults, {
                bodies: '',
                struct: true,
              });

              fetch.on('message', (msg: any, seqno: number) => {
                let messageData = '';
                let uid: string | null = null;

                msg.on('body', (stream: NodeJS.ReadableStream) => {
                  stream.on('data', (chunk: Buffer) => {
                    messageData += chunk.toString('utf8');
                  });
                });

                msg.once('attributes', (attrs: any) => {
                  uid = attrs.uid.toString();
                });

                msg.once('end', () => {
                  messageCount++;
                  
                  // Parse email using mailparser
                  simpleParser(messageData, (err: any, parsed: any) => {
                    if (err) {
                      console.error(`Error parsing IMAP message ${uid}:`, err);
                      if (messageCount >= fetchResults.length) {
                        imap.end();
                        resolve(messages);
                      }
                      return;
                    }

                    const emailMessage: EmailMessage = {
                      id: uid || `imap-${Date.now()}-${Math.random()}`,
                      from: parsed.from?.text || parsed.from?.value?.[0]?.address || '',
                      to: parsed.to?.text || parsed.to?.value?.[0]?.address || '',
                      subject: parsed.subject || '',
                      body: parsed.text || '',
                      html: parsed.html || undefined,
                      date: parsed.date || new Date(),
                      attachments: parsed.attachments?.map((att: any) => ({
                        filename: att.filename || 'attachment',
                        contentType: att.contentType || 'application/octet-stream',
                        size: att.size || 0,
                        data: att.content?.toString('base64'),
                      })),
                    };

                    messages.push(emailMessage);

                    if (messageCount >= fetchResults.length) {
                      imap.end();
                      resolve(messages);
                    }
                  });
                });
              });

              fetch.once('error', (err: Error) => {
                imap.end();
                reject(err);
              });
            });
          });
        });

        imap.once('error', (err: Error) => {
          emailTriggerMonitoring.recordFailure(trigger.id, err, 'connection_error');
          reject(err);
        });

        imap.once('end', () => {
          // Connection ended
        });

        imap.connect();
      } catch (error: any) {
        reject(new Error(`IMAP connection failed: ${error.message}`));
      }
    });
  }

  /**
   * Build Gmail API query string from filters
   */
  private buildGmailQuery(filters?: {
    from?: string;
    subject?: string;
    hasAttachment?: boolean;
  }): string {
    const queryParts: string[] = [];

    if (filters?.from) {
      queryParts.push(`from:${filters.from}`);
    }
    if (filters?.subject) {
      queryParts.push(`subject:${filters.subject}`);
    }
    if (filters?.hasAttachment) {
      queryParts.push('has:attachment');
    }

    return queryParts.join(' ');
  }

  /**
   * Build Outlook filter string from filters
   */
  private buildOutlookFilter(filters?: {
    from?: string;
    subject?: string;
    hasAttachment?: boolean;
  }): string {
    const filterParts: string[] = [];

    if (filters?.from) {
      filterParts.push(`from/emailAddress/address eq '${filters.from}'`);
    }
    if (filters?.subject) {
      filterParts.push(`contains(subject, '${filters.subject}')`);
    }
    if (filters?.hasAttachment) {
      filterParts.push('hasAttachments eq true');
    }

    return filterParts.join(' and ');
  }

  /**
   * Filter messages based on trigger filters
   */
  private filterMessages(
    messages: EmailMessage[],
    filters?: {
      from?: string;
      subject?: string;
      hasAttachment?: boolean;
    }
  ): EmailMessage[] {
    if (!filters) return messages;

    return messages.filter((msg) => {
      if (filters.from && !msg.from.includes(filters.from)) {
        return false;
      }
      if (filters.subject && !msg.subject.includes(filters.subject)) {
        return false;
      }
      if (filters.hasAttachment && (!msg.attachments || msg.attachments.length === 0)) {
        return false;
      }
      return true;
    });
  }

  /**
   * Register an email trigger (called when workflow is saved)
   */
  async registerEmailTrigger(
    workflowId: string,
    nodeId: string,
    config: {
      provider: 'gmail' | 'outlook' | 'imap';
      email: string;
      credentials: Record<string, unknown>;
      folder?: string;
      pollInterval?: number;
      filters?: Record<string, unknown>;
    },
    userId: string,
    organizationId?: string
  ): Promise<void> {
    // Check if trigger already exists
    const [existing] = await db
      .select()
      .from(emailTriggers)
      .where(
        and(
          eq(emailTriggers.workflowId, workflowId),
          eq(emailTriggers.nodeId, nodeId)
        )
      )
      .limit(1);

    if (existing) {
      // Encrypt credentials before storing
      const encryptedCredentials = encryptObject(config.credentials);
      
      // Update existing trigger
      await db
        .update(emailTriggers)
        .set({
          provider: config.provider,
          email: config.email,
          credentials: encryptedCredentials as any,
          folder: config.folder || 'INBOX',
          pollInterval: config.pollInterval || 60,
          filters: config.filters || null,
          active: true,
          updatedAt: new Date(),
        })
        .where(eq(emailTriggers.id, existing.id));

      // Restart polling if it was already running
      if (this.pollingIntervals.has(existing.id)) {
        clearInterval(this.pollingIntervals.get(existing.id)!);
        this.pollingIntervals.delete(existing.id);
      }
    } else {
      // Encrypt credentials before storing
      const encryptedCredentials = encryptObject(config.credentials);
      
      // Create new trigger
      await db.insert(emailTriggers).values({
        userId,
        organizationId: organizationId || null,
        workflowId,
        nodeId,
        provider: config.provider,
        email: config.email,
        credentials: encryptedCredentials as any,
        folder: config.folder || 'INBOX',
        pollInterval: config.pollInterval || 60,
        filters: config.filters || null,
        active: true,
      });
    }

    // Reload triggers to start polling
    await this.loadEmailTriggers();
  }

  /**
   * Unregister an email trigger (called when workflow is deleted or trigger node removed)
   */
  async unregisterEmailTrigger(workflowId: string, nodeId: string): Promise<void> {
    const [trigger] = await db
      .select()
      .from(emailTriggers)
      .where(
        and(
          eq(emailTriggers.workflowId, workflowId),
          eq(emailTriggers.nodeId, nodeId)
        )
      )
      .limit(1);

    if (trigger) {
      // Stop polling
      if (this.pollingIntervals.has(trigger.id)) {
        clearInterval(this.pollingIntervals.get(trigger.id)!);
        this.pollingIntervals.delete(trigger.id);
      }

      // Deactivate trigger
      await db
        .update(emailTriggers)
        .set({
          active: false,
          updatedAt: new Date(),
        })
        .where(eq(emailTriggers.id, trigger.id));
    }
  }

  /**
   * Refresh OAuth token if expired
   */
  private async refreshTokenIfNeeded(
    trigger: typeof emailTriggers.$inferSelect,
    credentials: { accessToken: string; refreshToken?: string }
  ): Promise<{ accessToken: string; refreshToken?: string }> {
    // If no refresh token, return as-is (IMAP doesn't use OAuth)
    if (!credentials.refreshToken || trigger.provider === 'imap') {
      return credentials;
    }

    try {
      if (trigger.provider === 'gmail') {
        return await this.refreshGmailToken(trigger, credentials);
      } else if (trigger.provider === 'outlook') {
        return await this.refreshOutlookToken(trigger, credentials);
      }
    } catch (error) {
      console.error(`Error refreshing token for trigger ${trigger.id}:`, error);
      // Return original credentials if refresh fails
    }

    return credentials;
  }

  /**
   * Refresh Gmail OAuth token
   */
  private async refreshGmailToken(
    trigger: typeof emailTriggers.$inferSelect,
    credentials: { accessToken: string; refreshToken?: string }
  ): Promise<{ accessToken: string; refreshToken?: string }> {
    if (!credentials.refreshToken) {
      return credentials;
    }

    const clientId = process.env.GMAIL_CLIENT_ID;
    const clientSecret = process.env.GMAIL_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      throw new Error('Gmail OAuth not configured');
    }

    try {
      const response = await axios.post('https://oauth2.googleapis.com/token', {
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: credentials.refreshToken,
        grant_type: 'refresh_token',
      });

      const newCredentials = {
        accessToken: response.data.access_token,
        refreshToken: credentials.refreshToken, // Refresh token doesn't change
      };

      // Update stored credentials
      const encryptedCredentials = encryptObject(newCredentials);
      await db
        .update(emailTriggers)
        .set({
          credentials: encryptedCredentials as any,
          updatedAt: new Date(),
        })
        .where(eq(emailTriggers.id, trigger.id));

      // Record successful token refresh
      emailTriggerMonitoring.recordTokenRefresh(trigger.id, true);
      
      return newCredentials;
    } catch (error: any) {
      console.error(`Failed to refresh Gmail token for trigger ${trigger.id}:`, error.response?.data || error.message);
      
      // Record token refresh failure
      emailTriggerMonitoring.recordTokenRefresh(trigger.id, false, error);
      
      throw error;
    }
  }

  /**
   * Refresh Outlook OAuth token
   */
  private async refreshOutlookToken(
    trigger: typeof emailTriggers.$inferSelect,
    credentials: { accessToken: string; refreshToken?: string }
  ): Promise<{ accessToken: string; refreshToken?: string }> {
    if (!credentials.refreshToken) {
      return credentials;
    }

    const clientId = process.env.OUTLOOK_CLIENT_ID;
    const clientSecret = process.env.OUTLOOK_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      throw new Error('Outlook OAuth not configured');
    }

    try {
      const response = await axios.post(
        'https://login.microsoftonline.com/common/oauth2/v2.0/token',
        new URLSearchParams({
          client_id: clientId,
          client_secret: clientSecret,
          refresh_token: credentials.refreshToken,
          grant_type: 'refresh_token',
          scope: 'https://graph.microsoft.com/Mail.Read offline_access',
        }),
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
        }
      );

      const newCredentials = {
        accessToken: response.data.access_token,
        refreshToken: response.data.refresh_token || credentials.refreshToken,
      };

      // Update stored credentials
      const encryptedCredentials = encryptObject(newCredentials);
      await db
        .update(emailTriggers)
        .set({
          credentials: encryptedCredentials as any,
          updatedAt: new Date(),
        })
        .where(eq(emailTriggers.id, trigger.id));

      // Record successful token refresh
      emailTriggerMonitoring.recordTokenRefresh(trigger.id, true);
      
      return newCredentials;
    } catch (error: any) {
      console.error(`Failed to refresh Outlook token for trigger ${trigger.id}:`, error.response?.data || error.message);
      
      // Record token refresh failure
      emailTriggerMonitoring.recordTokenRefresh(trigger.id, false, error);
      
      throw error;
    }
  }
}

export const emailTriggerService = new EmailTriggerService();

