export interface MigrationRecord {
  id: number
  name: string
  batch: number
  migration_time: string
}

export interface ExecuteResult {
  changes: number
  last_row_id: number
}

export interface DatabaseDriver {
  readonly name: string
  readonly knexClient: 'sqlite3' | 'pg' | 'mysql2'

  /**
   * 執行原生 SQL DDL 或異動語句
   */
  executeRaw(sql: string, bindings?: any[]): Promise<any>

  /**
   * 執行 SQL 查詢並回傳物件陣列
   */
  query<T = any>(sql: string, bindings?: any[]): Promise<T[]>

  /**
   * 執行寫入/更新語句，並回傳受影響筆數與新增之 ID
   */
  executeRun(sql: string, bindings?: any[]): Promise<ExecuteResult>

  /**
   * 取得指定資料表之所有欄位名稱 (用於 Model 屬性反射與序列化)
   */
  getTableColumns(tableName: string): Promise<string[]>

  /**
   * 查詢現有所有使用者資料表名稱 (不包含系統表與 adonis_schema)
   */
  getAllTables(): Promise<string[]>

  /**
   * 刪除指定資料表
   */
  dropTable(tableName: string): Promise<void>

  /**
   * 初始化 adonis_schema 遷移紀錄表，並自動相容既有資料表
   */
  initSchemaTable(migrationFiles: string[]): Promise<void>

  /**
   * 取得所有已套用之遷移紀錄清單
   */
  getMigratedRecords(): Promise<MigrationRecord[]>

  /**
   * 記錄單一遷移檔案套用狀態與批次
   */
  recordMigration(name: string, batch: number): Promise<void>

  /**
   * 移除單一遷移檔案之套用紀錄 (Rollback)
   */
  rollbackMigration(name: string): Promise<void>

  /**
   * 關閉驅動連線池資源
   */
  close(): Promise<void>
}
