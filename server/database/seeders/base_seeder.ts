export abstract class BaseSeeder {
  abstract run(): Promise<void>
}
