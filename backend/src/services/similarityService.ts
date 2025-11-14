/**
 * Similarity Calculation Service
 * 
 * Provides various similarity calculation methods for comparing embeddings:
 * - Cosine similarity (most common for embeddings)
 * - Euclidean distance
 * - Dot product
 * - Manhattan distance
 */

export type SimilarityMethod = 'cosine' | 'euclidean' | 'dot_product' | 'manhattan';

export interface SimilarityResult {
  score: number; // Similarity score (0.0-1.0 for cosine, distance for others)
  method: SimilarityMethod;
  normalizedScore?: number; // Normalized score (0.0-1.0) for distance-based methods
}

/**
 * Calculate cosine similarity between two vectors
 * 
 * Cosine similarity measures the cosine of the angle between two vectors.
 * Range: -1 to 1, where 1 means identical, 0 means orthogonal, -1 means opposite.
 * For embeddings, values are typically between 0 and 1.
 * 
 * @param vec1 - First vector
 * @param vec2 - Second vector
 * @returns Cosine similarity score (0.0-1.0)
 */
export function cosineSimilarity(vec1: number[], vec2: number[]): number {
  if (vec1.length !== vec2.length) {
    throw new Error(`Vector dimensions must match: ${vec1.length} vs ${vec2.length}`);
  }

  if (vec1.length === 0) {
    return 0;
  }

  // Calculate dot product
  let dotProduct = 0;
  for (let i = 0; i < vec1.length; i++) {
    dotProduct += vec1[i] * vec2[i];
  }

  // Calculate magnitudes
  let magnitude1 = 0;
  let magnitude2 = 0;
  for (let i = 0; i < vec1.length; i++) {
    magnitude1 += vec1[i] * vec1[i];
    magnitude2 += vec2[i] * vec2[i];
  }

  magnitude1 = Math.sqrt(magnitude1);
  magnitude2 = Math.sqrt(magnitude2);

  // Avoid division by zero
  if (magnitude1 === 0 || magnitude2 === 0) {
    return 0;
  }

  const similarity = dotProduct / (magnitude1 * magnitude2);

  // Normalize to 0-1 range (cosine similarity can be -1 to 1, but embeddings are typically 0-1)
  return Math.max(0, similarity);
}

/**
 * Calculate Euclidean distance between two vectors
 * 
 * Euclidean distance measures the straight-line distance between two points.
 * Lower values indicate more similarity.
 * 
 * @param vec1 - First vector
 * @param vec2 - Second vector
 * @returns Euclidean distance (0 to infinity, lower is more similar)
 */
export function euclideanDistance(vec1: number[], vec2: number[]): number {
  if (vec1.length !== vec2.length) {
    throw new Error(`Vector dimensions must match: ${vec1.length} vs ${vec2.length}`);
  }

  if (vec1.length === 0) {
    return 0;
  }

  let sumSquaredDiff = 0;
  for (let i = 0; i < vec1.length; i++) {
    const diff = vec1[i] - vec2[i];
    sumSquaredDiff += diff * diff;
  }

  return Math.sqrt(sumSquaredDiff);
}

/**
 * Normalize Euclidean distance to similarity score (0.0-1.0)
 * 
 * Uses a simple normalization: similarity = 1 / (1 + distance)
 * This maps distance 0 to similarity 1, and larger distances to lower similarities.
 * 
 * @param distance - Euclidean distance
 * @returns Normalized similarity score (0.0-1.0)
 */
export function normalizeEuclideanDistance(distance: number): number {
  return 1 / (1 + distance);
}

/**
 * Calculate dot product between two vectors
 * 
 * Dot product measures the magnitude of projection of one vector onto another.
 * Higher values indicate more similarity (when vectors are normalized).
 * 
 * @param vec1 - First vector
 * @param vec2 - Second vector
 * @returns Dot product
 */
export function dotProduct(vec1: number[], vec2: number[]): number {
  if (vec1.length !== vec2.length) {
    throw new Error(`Vector dimensions must match: ${vec1.length} vs ${vec2.length}`);
  }

  if (vec1.length === 0) {
    return 0;
  }

  let product = 0;
  for (let i = 0; i < vec1.length; i++) {
    product += vec1[i] * vec2[i];
  }

  return product;
}

/**
 * Normalize dot product to similarity score (0.0-1.0)
 * 
 * For normalized vectors, dot product equals cosine similarity.
 * This function assumes vectors are already normalized.
 * 
 * @param dotProduct - Dot product value
 * @returns Normalized similarity score (0.0-1.0)
 */
export function normalizeDotProduct(dotProduct: number): number {
  // If vectors are normalized, dot product is already in -1 to 1 range
  return Math.max(0, dotProduct);
}

/**
 * Calculate Manhattan distance (L1 norm) between two vectors
 * 
 * Manhattan distance measures the sum of absolute differences.
 * Lower values indicate more similarity.
 * 
 * @param vec1 - First vector
 * @param vec2 - Second vector
 * @returns Manhattan distance (0 to infinity, lower is more similar)
 */
export function manhattanDistance(vec1: number[], vec2: number[]): number {
  if (vec1.length !== vec2.length) {
    throw new Error(`Vector dimensions must match: ${vec1.length} vs ${vec2.length}`);
  }

  if (vec1.length === 0) {
    return 0;
  }

  let sumAbsDiff = 0;
  for (let i = 0; i < vec1.length; i++) {
    sumAbsDiff += Math.abs(vec1[i] - vec2[i]);
  }

  return sumAbsDiff;
}

/**
 * Normalize Manhattan distance to similarity score (0.0-1.0)
 * 
 * Uses a simple normalization: similarity = 1 / (1 + distance)
 * 
 * @param distance - Manhattan distance
 * @returns Normalized similarity score (0.0-1.0)
 */
export function normalizeManhattanDistance(distance: number): number {
  return 1 / (1 + distance);
}

/**
 * Calculate similarity between two vectors using specified method
 * 
 * @param vec1 - First vector
 * @param vec2 - Second vector
 * @param method - Similarity calculation method
 * @returns Similarity result with score and normalized score
 */
export function calculateSimilarity(
  vec1: number[],
  vec2: number[],
  method: SimilarityMethod = 'cosine'
): SimilarityResult {
  let score: number;
  let normalizedScore: number | undefined;

  switch (method) {
    case 'cosine':
      score = cosineSimilarity(vec1, vec2);
      normalizedScore = score; // Already normalized
      break;

    case 'euclidean':
      score = euclideanDistance(vec1, vec2);
      normalizedScore = normalizeEuclideanDistance(score);
      break;

    case 'dot_product':
      score = dotProduct(vec1, vec2);
      normalizedScore = normalizeDotProduct(score);
      break;

    case 'manhattan':
      score = manhattanDistance(vec1, vec2);
      normalizedScore = normalizeManhattanDistance(score);
      break;

    default:
      throw new Error(`Unsupported similarity method: ${method}`);
  }

  return {
    score,
    method,
    normalizedScore,
  };
}

/**
 * Check if similarity score exceeds threshold
 * 
 * @param similarityResult - Similarity calculation result
 * @param threshold - Threshold value (0.0-1.0)
 * @returns True if similarity exceeds threshold
 */
export function exceedsThreshold(
  similarityResult: SimilarityResult,
  threshold: number
): boolean {
  // Use normalized score if available, otherwise use raw score
  const score = similarityResult.normalizedScore ?? similarityResult.score;

  // For distance-based methods (euclidean, manhattan), lower is better
  // So we check if normalized score exceeds threshold
  if (similarityResult.method === 'euclidean' || similarityResult.method === 'manhattan') {
    return score >= threshold;
  }

  // For similarity-based methods (cosine, dot_product), higher is better
  return score >= threshold;
}

/**
 * Similarity Service class
 */
export class SimilarityService {
  /**
   * Calculate cosine similarity
   */
  cosine(vec1: number[], vec2: number[]): number {
    return cosineSimilarity(vec1, vec2);
  }

  /**
   * Calculate Euclidean distance
   */
  euclidean(vec1: number[], vec2: number[]): number {
    return euclideanDistance(vec1, vec2);
  }

  /**
   * Calculate dot product
   */
  dotProduct(vec1: number[], vec2: number[]): number {
    return dotProduct(vec1, vec2);
  }

  /**
   * Calculate Manhattan distance
   */
  manhattan(vec1: number[], vec2: number[]): number {
    return manhattanDistance(vec1, vec2);
  }

  /**
   * Calculate similarity using specified method
   */
  calculate(
    vec1: number[],
    vec2: number[],
    method: SimilarityMethod = 'cosine'
  ): SimilarityResult {
    return calculateSimilarity(vec1, vec2, method);
  }

  /**
   * Check if similarity exceeds threshold
   */
  exceedsThreshold(result: SimilarityResult, threshold: number): boolean {
    return exceedsThreshold(result, threshold);
  }
}

// Export singleton instance
export const similarityService = new SimilarityService();

