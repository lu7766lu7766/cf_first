export interface BodyParserConfig {
  allowedMethods: string[]
  json: {
    types: string[]
    limit: string
  }
  form: {
    types: string[]
    limit: string
  }
  multipart: {
    types: string[]
    maxFileSize: string
  }
}

export const bodyParserConfig: BodyParserConfig = {
  allowedMethods: ['POST', 'PUT', 'PATCH', 'DELETE'],
  json: {
    types: ['application/json', 'application/json-patch+json', 'application/vnd.api+json'],
    limit: '2mb'
  },
  form: {
    types: ['application/x-www-form-urlencoded'],
    limit: '2mb'
  },
  multipart: {
    types: ['multipart/form-data'],
    maxFileSize: '20mb'
  }
}
