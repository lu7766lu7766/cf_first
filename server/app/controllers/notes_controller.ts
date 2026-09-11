import { BaseController } from '../../core/controller'
import { inject } from '../../core/container'
import type { HttpContext } from '../../core/types'
import { NotesService } from '../services/notes_service'
import { CreateNoteValidator, UpdateNoteValidator } from '../validators/note_validator'
import { Note } from '../models/note'
import { HttpException } from '../../core/exception_handler'

@inject()
export default class NotesController extends BaseController {
  private notesService: NotesService

  constructor(notesService?: NotesService) {
    super()
    this.notesService = notesService || new NotesService()
  }

  async index(ctx: HttpContext) {
    const notes = await this.notesService.getAllNotes()
    return ctx.response.json({
      success: true,
      total: notes.length,
      data: notes.map((n) => n.toJSON())
    })
  }

  async store(ctx: HttpContext) {
    // 透過 VineJS Class 驗證，不符則自動拋出 422 ValidationException
    const payload = await this.validate(CreateNoteValidator, await ctx.request.all())

    const note = await this.notesService.createNote(payload)

    return ctx.response.status(201).json({
      message: '筆記建立成功 (透過 Model Active Record)',
      data: note.toJSON()
    })
  }

  async show(ctx: HttpContext) {
    const id = ctx.params.id
    const note = await this.notesService.findNoteById(id)
    if (!note) {
      throw new HttpException(`找不到 ID 為 ${id} 的筆記`, 404, 'E_ROW_NOT_FOUND')
    }
    return ctx.response.json({ success: true, data: note.toJSON() })
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

    return ctx.response.json({
      message: '筆記更新成功',
      data: note.toJSON()
    })
  }

  async destroy(ctx: HttpContext) {
    const id = ctx.params.id
    const note = await this.notesService.findNoteById(id)
    if (!note) {
      throw new HttpException(`找不到 ID 為 ${id} 的筆記`, 404, 'E_ROW_NOT_FOUND')
    }

    await note.delete()
    return ctx.response.json({ message: '筆記已成功刪除' })
  }

  async transactionTest(ctx: HttpContext) {
    const result = await this.notesService.runTransactionDemo()
    return ctx.response.json(result)
  }
}
