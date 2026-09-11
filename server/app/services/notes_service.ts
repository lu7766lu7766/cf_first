import { inject } from '../../core/container'
import { Note } from '../models/note'
import { Database } from '../../core/database'

@inject()
export class NotesService {
  async getAllNotes(): Promise<Note[]> {
    return await Note.all()
  }

  async findNoteById(id: number | string): Promise<Note | null> {
    return await Note.find(id)
  }

  async createNote(data: { title: string; content: string }): Promise<Note> {
    return await Note.create(data)
  }

  /**
   * 示範資料庫事務交易：包含正常提交與異常回滾測試
   */
  async runTransactionDemo(): Promise<{ success: boolean; message: string; data: any }> {
    return await Database.transaction(async (trx) => {
      // 1. 在事務中建立第一筆記錄
      const firstNote = await trx.from('notes').insert({
        title: '事務測試紀錄 A',
        content: '第一筆成功寫入'
      })

      // 2. 在事務中建立第二筆記錄
      const secondNote = await trx.from('notes').insert({
        title: '事務測試紀錄 B',
        content: '第二筆成功寫入'
      })

      return {
        success: true,
        message: '資料庫事務成功 Commit！兩筆資料已同時持久化。',
        data: { firstNote, secondNote }
      }
    })
  }
}
