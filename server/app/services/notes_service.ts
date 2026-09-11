import { inject } from "../../core/container"
import { Note } from "../models/note"
import { Database } from "../../core/database"

@inject()
export class NotesService {
  async getAllNotes(): Promise<Note[]> {
    return await Note.query().preload("user")
  }

  async findNoteById(id: number | string): Promise<Note> {
    const note = await Note.findOrFail(id)
    await note.load("user")
    return note
  }

  async createNote(data: { title: string; content: string; user_id?: number }): Promise<Note> {
    return await Note.create({
      user_id: data.user_id || 1,
      title: data.title,
      content: data.content,
    })
  }

  /**
   * 示範資料庫事務交易：包含 isolationLevel 隔離等級、forUpdate 悲觀鎖查詢與正常提交測試
   */
  async runTransactionDemo(): Promise<{ success: boolean; message: string; data: any }> {
    return await Database.transaction(
      async (trx) => {
        // 1. 透過 Model 查詢並加上悲觀排他鎖 (.forUpdate())
        const modelQuery = Note.query({ client: trx }).where("id", 1).forUpdate()
        const lockedNote = await modelQuery.first()

        // 2. 透過 QueryBuilder 悲觀鎖查詢 (.forUpdate())
        const qbQuery = trx.from("notes").where("id", 1).forUpdate()
        const rawLockedNote = await qbQuery.first()

        // 3. 在事務中建立第一筆記錄
        const firstNote = await trx.from("notes").insert({
          user_id: 1,
          title: "事務測試紀錄 A (含 forUpdate 與隔離)",
          content: "第一筆成功寫入",
        })

        // 4. 在事務中建立第二筆記錄
        const secondNote = await trx.from("notes").insert({
          user_id: 1,
          title: "事務測試紀錄 B (含 forUpdate 與隔離)",
          content: "第二筆成功寫入",
        })

        return {
          success: true,
          message: "資料庫事務成功 Commit！已成功套用隔離等級與 forUpdate 鎖定語法適配。",
          data: {
            isolationLevel: trx.isolationLevel,
            modelLockMode: modelQuery.getLockMode(),
            qbLockMode: qbQuery.getLockMode(),
            lockedNoteTitle: lockedNote?.title || null,
            rawLockedNoteTitle: rawLockedNote?.title || null,
            firstNote,
            secondNote,
          },
        }
      },
      { isolationLevel: "serializable" }
    )
  }
}
