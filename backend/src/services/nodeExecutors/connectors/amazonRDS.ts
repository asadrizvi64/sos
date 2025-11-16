/**
 * Amazon RDS Connector Executor
 * 
 * Executes Amazon RDS connector actions
 * Note: RDS supports multiple database engines (MySQL, PostgreSQL, SQL Server, etc.)
 * This connector provides a unified interface for RDS instances
 */

import mysql from 'mysql2/promise';
import { Pool } from 'pg';
import sql from 'mssql';
import { NodeExecutionResult } from '@sos/shared';

interface AmazonRDSCredentials {
  host: string; // RDS endpoint
  port: number;
  database: string;
  username: string;
  password: string;
  engine: 'mysql' | 'postgresql' | 'sqlserver' | 'mariadb' | 'aurora-mysql' | 'aurora-postgresql';
  ssl?: boolean;
}

/**
 * Execute a SQL query on Amazon RDS
 */
export async function executeRDSQuery(
  query: string,
  credentials: AmazonRDSCredentials
): Promise<NodeExecutionResult> {
  try {
    const engine = credentials.engine.toLowerCase();
    
    if (engine === 'mysql' || engine === 'mariadb' || engine === 'aurora-mysql') {
      // MySQL/MariaDB/Aurora MySQL
      const connection = await mysql.createConnection({
        host: credentials.host,
        port: credentials.port,
        user: credentials.username,
        password: credentials.password,
        database: credentials.database,
        ssl: credentials.ssl ? {} : undefined,
      });
      
      try {
        const [rows] = await connection.execute(query);
        await connection.end();
        
        return {
          success: true,
          output: {
            rows: Array.isArray(rows) ? rows : [rows],
          },
        };
      } catch (error) {
        await connection.end();
        throw error;
      }
    } else if (engine === 'postgresql' || engine === 'aurora-postgresql') {
      // PostgreSQL/Aurora PostgreSQL
      const pool = new Pool({
        host: credentials.host,
        port: credentials.port,
        user: credentials.username,
        password: credentials.password,
        database: credentials.database,
        ssl: credentials.ssl ? { rejectUnauthorized: false } : false,
      });
      
      try {
        const result = await pool.query(query);
        await pool.end();
        
        return {
          success: true,
          output: {
            rows: result.rows,
            rowCount: result.rowCount,
          },
        };
      } catch (error) {
        await pool.end();
        throw error;
      }
    } else if (engine === 'sqlserver') {
      // SQL Server
      const config: sql.config = {
        server: credentials.host,
        port: credentials.port,
        user: credentials.username,
        password: credentials.password,
        database: credentials.database,
        options: {
          encrypt: credentials.ssl !== false,
          enableArithAbort: true,
        },
      };
      
      const pool = await sql.connect(config);
      
      try {
        const result = await pool.request().query(query);
        await pool.close();
        
        return {
          success: true,
          output: {
            rows: result.recordset,
            rowsAffected: result.rowsAffected,
          },
        };
      } catch (error) {
        await pool.close();
        throw error;
      }
    } else {
      return {
        success: false,
        error: {
          message: `Unsupported RDS engine: ${credentials.engine}`,
          code: 'UNSUPPORTED_ENGINE',
        },
      };
    }
  } catch (error: any) {
    return {
      success: false,
      error: {
        message: error.message || 'RDS query execution failed',
        code: 'RDS_QUERY_ERROR',
        details: error,
      },
    };
  }
}

/**
 * List tables in an RDS database
 */
export async function executeRDSListTables(
  schema?: string,
  credentials: AmazonRDSCredentials
): Promise<NodeExecutionResult> {
  try {
    const engine = credentials.engine.toLowerCase();
    const schemaName = schema || (engine === 'sqlserver' ? 'dbo' : 'public');
    
    if (engine === 'mysql' || engine === 'mariadb' || engine === 'aurora-mysql') {
      // MySQL/MariaDB/Aurora MySQL
      const connection = await mysql.createConnection({
        host: credentials.host,
        port: credentials.port,
        user: credentials.username,
        password: credentials.password,
        database: credentials.database,
        ssl: credentials.ssl ? {} : undefined,
      });
      
      try {
        const [rows] = await connection.execute(
          'SELECT TABLE_SCHEMA, TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = ?',
          [schemaName]
        );
        await connection.end();
        
        return {
          success: true,
          output: {
            tables: Array.isArray(rows) ? rows.map((row: any) => ({
              schema: row.TABLE_SCHEMA,
              name: row.TABLE_NAME,
            })) : [],
          },
        };
      } catch (error) {
        await connection.end();
        throw error;
      }
    } else if (engine === 'postgresql' || engine === 'aurora-postgresql') {
      // PostgreSQL/Aurora PostgreSQL
      const pool = new Pool({
        host: credentials.host,
        port: credentials.port,
        user: credentials.username,
        password: credentials.password,
        database: credentials.database,
        ssl: credentials.ssl ? { rejectUnauthorized: false } : false,
      });
      
      try {
        const result = await pool.query(
          `SELECT table_schema, table_name FROM information_schema.tables WHERE table_schema = $1`,
          [schemaName]
        );
        await pool.end();
        
        return {
          success: true,
          output: {
            tables: result.rows.map(row => ({
              schema: row.table_schema,
              name: row.table_name,
            })),
          },
        };
      } catch (error) {
        await pool.end();
        throw error;
      }
    } else if (engine === 'sqlserver') {
      // SQL Server
      const config: sql.config = {
        server: credentials.host,
        port: credentials.port,
        user: credentials.username,
        password: credentials.password,
        database: credentials.database,
        options: {
          encrypt: credentials.ssl !== false,
          enableArithAbort: true,
        },
      };
      
      const pool = await sql.connect(config);
      
      try {
        const result = await pool.request()
          .input('schema', sql.NVarChar, schemaName)
          .query(`
            SELECT TABLE_SCHEMA, TABLE_NAME
            FROM INFORMATION_SCHEMA.TABLES
            WHERE TABLE_TYPE = 'BASE TABLE' AND TABLE_SCHEMA = @schema
          `);
        await pool.close();
        
        return {
          success: true,
          output: {
            tables: result.recordset.map((row: any) => ({
              schema: row.TABLE_SCHEMA,
              name: row.TABLE_NAME,
            })),
          },
        };
      } catch (error) {
        await pool.close();
        throw error;
      }
    } else {
      return {
        success: false,
        error: {
          message: `Unsupported RDS engine: ${credentials.engine}`,
          code: 'UNSUPPORTED_ENGINE',
        },
      };
    }
  } catch (error: any) {
    return {
      success: false,
      error: {
        message: error.message || 'RDS list tables failed',
        code: 'RDS_LIST_TABLES_ERROR',
        details: error,
      },
    };
  }
}

/**
 * Execute Amazon RDS connector action
 */
export async function executeAmazonRDS(
  actionId: string,
  input: Record<string, unknown>,
  credentials: AmazonRDSCredentials
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
      return executeRDSQuery(query, credentials);

    case 'list_tables':
      const schema = input.schema as string | undefined;
      return executeRDSListTables(schema, credentials);

    default:
      return {
        success: false,
        error: {
          message: `Unknown Amazon RDS action: ${actionId}`,
          code: 'UNKNOWN_ACTION',
        },
      };
  }
}

