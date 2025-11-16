/**
 * AWS S3 Connector Executor
 * 
 * Executes AWS S3 connector actions using the AWS SDK v3
 */

import { S3Client, PutObjectCommand, GetObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';
import { NodeExecutionResult } from '@sos/shared';

interface AWSS3Credentials {
  access_key_id: string;
  secret_access_key: string;
  region?: string;
}

/**
 * Create AWS S3 client
 */
function createS3Client(credentials: AWSS3Credentials): S3Client {
  const region = credentials.region || 'us-east-1';
  
  return new S3Client({
    region,
    credentials: {
      accessKeyId: credentials.access_key_id,
      secretAccessKey: credentials.secret_access_key,
    },
  });
}

/**
 * Upload a file to S3
 */
export async function executeS3UploadFile(
  bucket: string,
  key: string,
  content: string, // Base64 encoded or plain text
  contentType?: string,
  credentials: AWSS3Credentials
): Promise<NodeExecutionResult> {
  try {
    const client = createS3Client(credentials);
    
    // Decode base64 if needed, otherwise use as-is
    let body: Buffer | string = content;
    if (content.match(/^[A-Za-z0-9+/]*={0,2}$/) && content.length % 4 === 0) {
      try {
        body = Buffer.from(content, 'base64');
      } catch {
        // Not base64, use as string
        body = content;
      }
    } else {
      body = Buffer.from(content, 'utf-8');
    }

    const command = new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: body,
      ContentType: contentType || 'application/octet-stream',
    });

    await client.send(command);

    return {
      success: true,
      output: {
        bucket,
        key,
        url: `https://${bucket}.s3.${credentials.region || 'us-east-1'}.amazonaws.com/${key}`,
      },
    };
  } catch (error: any) {
    return {
      success: false,
      error: {
        message: error.message || 'S3 file upload failed',
        code: 'S3_UPLOAD_ERROR',
        details: error,
      },
    };
  }
}

/**
 * Get a file from S3
 */
export async function executeS3GetFile(
  bucket: string,
  key: string,
  credentials: AWSS3Credentials
): Promise<NodeExecutionResult> {
  try {
    const client = createS3Client(credentials);
    
    const command = new GetObjectCommand({
      Bucket: bucket,
      Key: key,
    });

    const response = await client.send(command);
    const chunks: Uint8Array[] = [];
    
    if (response.Body) {
      for await (const chunk of response.Body as any) {
        chunks.push(chunk);
      }
    }
    
    const buffer = Buffer.concat(chunks);
    const content = buffer.toString('utf-8');

    return {
      success: true,
      output: {
        content,
        contentType: response.ContentType,
        contentLength: response.ContentLength,
      },
    };
  } catch (error: any) {
    return {
      success: false,
      error: {
        message: error.message || 'S3 file get failed',
        code: 'S3_GET_FILE_ERROR',
        details: error,
      },
    };
  }
}

/**
 * List files in S3 bucket
 */
export async function executeS3ListFiles(
  bucket: string,
  prefix?: string,
  maxKeys: number = 1000,
  credentials: AWSS3Credentials
): Promise<NodeExecutionResult> {
  try {
    const client = createS3Client(credentials);
    
    const command = new ListObjectsV2Command({
      Bucket: bucket,
      Prefix: prefix,
      MaxKeys: maxKeys,
    });

    const response = await client.send(command);

    return {
      success: true,
      output: {
        files: (response.Contents || []).map(item => ({
          key: item.Key,
          size: item.Size,
          lastModified: item.LastModified,
          etag: item.ETag,
        })),
        isTruncated: response.IsTruncated,
        nextContinuationToken: response.NextContinuationToken,
      },
    };
  } catch (error: any) {
    return {
      success: false,
      error: {
        message: error.message || 'S3 list files failed',
        code: 'S3_LIST_FILES_ERROR',
        details: error,
      },
    };
  }
}

/**
 * Execute AWS S3 connector action
 */
export async function executeAWSS3(
  actionId: string,
  input: Record<string, unknown>,
  credentials: AWSS3Credentials
): Promise<NodeExecutionResult> {
  switch (actionId) {
    case 'upload_file':
      const bucket = input.bucket as string;
      const key = input.key as string;
      const content = input.content as string;
      const contentType = input.contentType as string | undefined;
      
      if (!bucket || !key || !content) {
        return {
          success: false,
          error: {
            message: 'bucket, key, and content are required',
            code: 'MISSING_PARAMETERS',
          },
        };
      }
      return executeS3UploadFile(bucket, key, content, contentType, credentials);

    case 'get_file':
      const getBucket = input.bucket as string;
      const getKey = input.key as string;
      
      if (!getBucket || !getKey) {
        return {
          success: false,
          error: {
            message: 'bucket and key are required',
            code: 'MISSING_PARAMETERS',
          },
        };
      }
      return executeS3GetFile(getBucket, getKey, credentials);

    case 'list_files':
      const listBucket = input.bucket as string;
      const prefix = input.prefix as string | undefined;
      const maxKeys = (input.maxKeys as number) || 1000;
      
      if (!listBucket) {
        return {
          success: false,
          error: {
            message: 'bucket is required',
            code: 'MISSING_PARAMETERS',
          },
        };
      }
      return executeS3ListFiles(listBucket, prefix, maxKeys, credentials);

    default:
      return {
        success: false,
        error: {
          message: `Unknown AWS S3 action: ${actionId}`,
          code: 'UNKNOWN_ACTION',
        },
      };
  }
}

