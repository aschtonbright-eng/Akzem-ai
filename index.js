import express from 'express'
import akzemApp from './server/index.js'

const app = express()
app.use(akzemApp)

export default app
