/**
 * Amazon DynamoDB Connector Executor
 * 
 * Executes DynamoDB connector actions using AWS SDK v3
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, GetCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { NodeExecutionResult } from '@sos/shared';

interface DynamoDBCredentials {
  access_key_id: string;
  secret_access_key: string;
  region?: string;
}

/**
 * Create DynamoDB document client
 */
function createDynamoDBClient(credentials: DynamoDBCredentials): DynamoDBDocumentClient {
  const region = credentials.region || 'us-east-1';
  
  const client = new DynamoDBClient({
    region,
    credentials: {
      accessKeyId: credentials.access_key_id,
      secretAccessKey: credentials.secret_access_key,
    },
  });
  
  return DynamoDBDocumentClient.from(client);
}

/**
 * Put an item in DynamoDB
 */
export async function executeDynamoDBPutItem(
  tableName: string,
  item: Record<string, unknown>,
  credentials: DynamoDBCredentials
): Promise<NodeExecutionResult> {
  try {
    const client = createDynamoDBClient(credentials);
    
    const command = new PutCommand({
      TableName: tableName,
      Item: item,
    });
    
    await client.send(command);
    
    return {
      success: true,
      output: {
        success: true,
        tableName,
      },
    };
  } catch (error: any) {
    return {
      success: false,
      error: {
        message: error.message || 'DynamoDB put item failed',
        code: 'DYNAMODB_PUT_ITEM_ERROR',
        details: error,
      },
    };
  }
}

/**
 * Get an item from DynamoDB
 */
export async function executeDynamoDBGetItem(
  tableName: string,
  key: Record<string, unknown>,
  credentials: DynamoDBCredentials
): Promise<NodeExecutionResult> {
  try {
    const client = createDynamoDBClient(credentials);
    
    const command = new GetCommand({
      TableName: tableName,
      Key: key,
    });
    
    const response = await client.send(command);
    
    return {
      success: true,
      output: {
        item: response.Item || null,
      },
    };
  } catch (error: any) {
    return {
      success: false,
      error: {
        message: error.message || 'DynamoDB get item failed',
        code: 'DYNAMODB_GET_ITEM_ERROR',
        details: error,
      },
    };
  }
}

/**
 * Query items from DynamoDB
 */
export async function executeDynamoDBQuery(
  tableName: string,
  keyConditionExpression: string,
  expressionAttributeValues?: Record<string, unknown>,
  indexName?: string,
  limit?: number,
  credentials: DynamoDBCredentials
): Promise<NodeExecutionResult> {
  try {
    const client = createDynamoDBClient(credentials);
    
    const command = new QueryCommand({
      TableName: tableName,
      KeyConditionExpression: keyConditionExpression,
      ExpressionAttributeValues: expressionAttributeValues,
      IndexName: indexName,
      Limit: limit,
    });
    
    const response = await client.send(command);
    
    return {
      success: true,
      output: {
        items: response.Items || [],
        count: response.Count,
        scannedCount: response.ScannedCount,
        lastEvaluatedKey: response.LastEvaluatedKey,
      },
    };
  } catch (error: any) {
    return {
      success: false,
      error: {
        message: error.message || 'DynamoDB query failed',
        code: 'DYNAMODB_QUERY_ERROR',
        details: error,
      },
    };
  }
}

/**
 * Execute DynamoDB connector action
 */
export async function executeDynamoDB(
  actionId: string,
  input: Record<string, unknown>,
  credentials: DynamoDBCredentials
): Promise<NodeExecutionResult> {
  switch (actionId) {
    case 'put_item':
      const tableName = input.tableName as string;
      const item = input.item as Record<string, unknown>;
      
      if (!tableName || !item) {
        return {
          success: false,
          error: {
            message: 'tableName and item are required',
            code: 'MISSING_PARAMETERS',
          },
        };
      }
      return executeDynamoDBPutItem(tableName, item, credentials);

    case 'get_item':
      const getTableName = input.tableName as string;
      const key = input.key as Record<string, unknown>;
      
      if (!getTableName || !key) {
        return {
          success: false,
          error: {
            message: 'tableName and key are required',
            code: 'MISSING_PARAMETERS',
          },
        };
      }
      return executeDynamoDBGetItem(getTableName, key, credentials);

    case 'query':
      const queryTableName = input.tableName as string;
      const keyConditionExpression = input.keyConditionExpression as string;
      const expressionAttributeValues = input.expressionAttributeValues as Record<string, unknown> | undefined;
      const indexName = input.indexName as string | undefined;
      const limit = input.limit as number | undefined;
      
      if (!queryTableName || !keyConditionExpression) {
        return {
          success: false,
          error: {
            message: 'tableName and keyConditionExpression are required',
            code: 'MISSING_PARAMETERS',
          },
        };
      }
      return executeDynamoDBQuery(queryTableName, keyConditionExpression, expressionAttributeValues, indexName, limit, credentials);

    default:
      return {
        success: false,
        error: {
          message: `Unknown DynamoDB action: ${actionId}`,
          code: 'UNKNOWN_ACTION',
        },
      };
  }
}

