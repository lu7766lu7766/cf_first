import { BaseController } from '../../core/controller'
import { inject } from '../../core/container'
import type { HttpContext } from '../../core/types'
import { NotesService } from '../services/notes_service'
import { CreateNoteValidator, UpdateNoteValidator } from '../validators/note_validator'
import { HttpException } from '../../core/exception_handler'

@inject()
export default class NotesController extends BaseController {
  private notesService: NotesService

  constructor(notesService?: NotesService) {
    super()
    this.notesService = notesService || new NotesService()
  }

  async index() {
    const notes = await this.notesService.getAllNotes()
    // 直接返回資料物件（由核心層與 ApiFormatMiddleware 自動遞迴序列化）
    return {
      success: true,
      total: notes.length,
      data: notes
    }
  }

  async store(ctx: HttpContext) {
    // 透過 VineJS Class 驗證，不符則自動拋出 422 ValidationException
    const payload = await this.validate(CreateNoteValidator, await ctx.request.all())

    const userId = payload.user_id || ctx.auth?.user?.id || 1
    const note = await this.notesService.createNote({
      ...payload,
      user_id: userId
    })

    // 直接返回新增筆記資料
    return {
      message: '筆記建立成功 (透過 Model Active Record)',
      data: note
    }
  }

  async show(ctx: HttpContext) {
    const id = ctx.params.id
    const note = await this.notesService.findNoteById(id)
    if (!note) {
      throw new HttpException(`找不到 ID 為 ${id} 的筆記`, 404, 'E_ROW_NOT_FOUND')
    }
    // 直接返回查詢結果
    return {
      success: true,
      data: note
    }
  }

  async update(ctx: HttpContext) {
    const id = ctx.params.id
    const note = await this.notesService.findNoteById(id)
    if (!note) {
      throw new HttpException(`找不到 ID 為 ${id} 的筆記`, 404, 'E_ROW_NOT_FOUND')
    }

    const payload = await this.validate(UpdateNoteValidator, await ctx.request.all())
    Object.assign(note, payload)
    await note.save()

    // 直接返回更新結果
    return {
      message: '筆記更新成功',
      data: note
    }
  }

  async destroy(ctx: HttpContext) {
    const id = ctx.params.id
    const note = await this.notesService.findNoteById(id)
    if (!note) {
      throw new HttpException(`找不到 ID 為 ${id} 的筆記`, 404, 'E_ROW_NOT_FOUND')
    }

    await note.delete()
    // 直接返回刪除訊息
    return {
      message: '筆記已成功刪除'
    }
  }

  async transactionTest() {
    // 直接返回事務執行結果
    return await this.notesService.runTransactionDemo()
  }
}

