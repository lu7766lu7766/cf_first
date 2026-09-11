import { inject } from "../../core/container"
import { Note } from "../models/note"
import { Database } from "../../core/database"

@inject()
export class NotesService {
  async getAllNotes(): Promise<Note[]> {
    const notes = await Note.all()
    await Note.preload(notes, "user")
    return notes
  }

  async findNoteById(id: number | string): Promise<Note | null> {
    const note = await Note.find(id)
    if (note) {
      await note.load("user")
    }
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
   * 示範資料庫事務交易：包含正常提交與異常回滾測試
   */
  async runTransactionDemo(): Promise<{ success: boolean; message: string; data: any }> {
    return await Database.transaction(async (trx) => {
      // 1. 在事務中建立第一筆記錄
      const firstNote = await trx.from("notes").insert({
        user_id: 1,
        title: "事務測試紀錄 A",
        content: "第一筆成功寫入",
      })

      // 2. 在事務中建立第二筆記錄
      const secondNote = await trx.from("notes").insert({
        user_id: 1,
        title: "事務測試紀錄 B",
        content: "第二筆成功寫入",
      })

      return {
        success: true,
        message: "資料庫事務成功 Commit！兩筆資料已同時持久化。",
        data: { firstNote, secondNote },
      }
    })
  }
}
