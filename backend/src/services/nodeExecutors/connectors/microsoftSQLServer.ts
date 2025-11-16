/**
 * Microsoft SQL Server Connector Executor
 * 
 * Executes Microsoft SQL Server connector actions using mssql library
 */

import sql from 'mssql';
import { NodeExecutionResult } from '@sos/shared';

interface SQLServerCredentials {
  connection_string: string; // e.g., 'Server=server;Database=db;User Id=user;Password=pass;Encrypt=true'
}

/**
 * Parse connection string into config object
 */
function parseConnectionString(connectionString: string): sql.config {
  const config: any = {};
  const parts = connectionString.split(';');
  
  for (const part of parts) {
    const [key, value] = part.split('=').map(s => s.trim());
    if (!key || !value) continue;
    
    switch (key.toLowerCase()) {
      case 'server':
        config.server = value;
        break;
      case 'database':
        config.database = value;
        break;
      case 'user id':
      case 'userid':
        config.user = value;
        break;
      case 'password':
        config.password = value;
        break;
      case 'port':
        config.port = parseInt(value, 10);
        break;
      case 'encrypt':
        config.options = config.options || {};
        config.options.encrypt = value.toLowerCase() === 'true';
        break;
    }
  }
  
  config.options = config.options || {};
  config.options.enableArithAbort = true;
  
  return config as sql.config;
}

/**
 * Execute a SQL query on Microsoft SQL Server
 */
export async function executeSQLServerQuery(
  query: string,
  credentials: SQLServerCredentials
): Promise<NodeExecutionResult> {
  let pool: sql.ConnectionPool | null = null;
  
  try {
    const config = parseConnectionString(credentials.connection_string);
    pool = await sql.connect(config);
    
    const result = await pool.request().query(query);
    
    return {
      success: true,
      output: {
        rows: result.recordset,
        rowsAffected: result.rowsAffected,
      },
    };
  } catch (error: any) {
    return {
      success: false,
      error: {
        message: error.message || 'SQL Server query execution failed',
        code: 'SQL_SERVER_QUERY_ERROR',
        details: error,
      },
    };
  } finally {
    if (pool) {
      await pool.close();
    }
  }
}

/**
 * List tables in a SQL Server database
 */
export async function executeSQLServerListTables(
  schema?: string,
  credentials: SQLServerCredentials
): Promise<NodeExecutionResult> {
  let pool: sql.ConnectionPool | null = null;
  
  try {
    const config = parseConnectionString(credentials.connection_string);
    pool = await sql.connect(config);
    
    const schemaName = schema || 'dbo';
    const query = `
      SELECT 
        TABLE_SCHEMA,
        TABLE_NAME
      FROM INFORMATION_SCHEMA.TABLES
      WHERE TABLE_TYPE = 'BASE TABLE'
        AND TABLE_SCHEMA = @schema
      ORDER BY TABLE_SCHEMA, TABLE_NAME
    `;
    
    const result = await pool.request()
      .input('schema', sql.NVarChar, schemaName)
      .query(query);
    
    return {
      success: true,
      output: {
        tables: result.recordset.map((row: any) => ({
          schema: row.TABLE_SCHEMA,
          name: row.TABLE_NAME,
        })),
      },
    };
  } catch (error: any) {
    return {
      success: false,
      error: {
        message: error.message || 'SQL Server list tables failed',
        code: 'SQL_SERVER_LIST_TABLES_ERROR',
        details: error,
      },
    };
  } finally {
    if (pool) {
      await pool.close();
    }
  }
}

/**
 * Execute Microsoft SQL Server connector action
 */
export async function executeMicrosoftSQLServer(
  actionId: string,
  input: Record<string, unknown>,
  credentials: SQLServerCredentials
): Promise<NodeExecutionResult> {
  switch (actionId) {
    case 'execute_query':
      const query = input.query as string;
      
      if (!query) {
        return {
          success: false,
          error: {
            message: 'query is required',
            code: 'MISSING_PARAMETERS',
          },
        };
      }
      return executeSQLServerQuery(query, credentials);

    case 'list_tables':
      const schema = input.schema as string | undefined;
      return executeSQLServerListTables(schema, credentials);

    default:
      return {
        success: false,
        error: {
          message: `Unknown Microsoft SQL Server action: ${actionId}`,
          code: 'UNKNOWN_ACTION',
        },
      };
  }
}

