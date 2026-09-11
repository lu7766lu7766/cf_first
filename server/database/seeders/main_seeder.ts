import { User } from '../../app/models/user'
import { Note } from '../../app/models/note'
import { Hash } from '../../core/hash'
import { BaseSeeder } from './base_seeder'

export { BaseSeeder }

export default class MainSeeder extends BaseSeeder {
  async run(): Promise<void> {
    console.log('🌱 開始執行資料庫種子腳本 (Database Seeder)...')

    // 建立預設管理員 root/root
    const uCol = User.getUsernameColumn()
    let rootUser = await User.findBy(uCol, 'root')
    if (!rootUser) {
      const hashedPassword = await Hash.make('root')
      rootUser = await User.create({
        username: 'root',
        email: 'root@example.com',
        password: hashedPassword,
        full_name: '系統管理員 Root'
      })
      console.log('   ✅ 已建立種子管理員帳號: root / root')
    } else {
      console.log('   ℹ️ 種子帳號 root 已存在，略過建立。')
    }

    // 建立預設筆記 (綁定 rootUser.id)
    const allNotes = await Note.all()
    if (allNotes.length === 0) {
      await Note.create({
        user_id: rootUser.id,
        title: '【種子筆記 1】探索 AdonisJS 7 開發體驗',
        content: '採用 Class Controller、Active Record 與 VineJS 驗證'
      })
      console.log('   ✅ 已建立初始展示筆記 (user_id: ' + rootUser.id + ')')
    } else {
      for (const note of allNotes) {
        if (!note.user_id) {
          note.user_id = rootUser.id
          await note.save()
          console.log(`   🔄 已更新現有筆記 #${note.id} 的 user_id 為 ${rootUser.id}`)
        }
      }
    }

    console.log('🎉 種子資料填充完成！')
  }
}
