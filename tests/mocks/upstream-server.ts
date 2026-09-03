import { createServer, type Server } from 'node:http'

/**
 * 假的「外部 API」伺服器。
 *
 * ## 為什麼是真的 HTTP 伺服器，而不是 MSW 之類的攔截器
 * 端對端測試中，Nuxt 伺服器是被**另一個 process** 啟動的。
 * 在測試 process 裡做 fetch 攔截（MSW、`vi.mock`）完全影響不到它。
 *
 * 起一個真的 HTTP 伺服器，讓 BFF 用真實的網路呼叫連上來，才能驗證
 * 「前端 → BFF → 外部 API」這條完整鏈路，包含 header 傳遞、逾時、
 * 錯誤映射等只有在真實網路往返中才會發生的行為。
 *
 * 元件層級的測試不需要用到它 —— 那裡用 `registerEndpoint` 更輕量。
 */

export interface UpstreamStub {
  /** BFF 應該指向的位址。 */
  baseUrl: string
  /** 收到的請求紀錄，供斷言 header 傳遞等行為。 */
  requests: Array<{ method: string; url: string; headers: Record<string, string> }>
  close: () => Promise<void>
}

const ITEMS = Array.from({ length: 25 }, (_, index) => ({
  id: String(index + 1),
  title: `上游項目 ${index + 1}`,
  description: `來自外部 API 的第 ${index + 1} 筆資料`,
  createdAt: new Date(Date.UTC(2026, 0, 1 + index)).toISOString(),
}))

/** 啟動 stub 上游服務，回傳它的位址與控制介面。 */
export async function startUpstreamStub(port = 0): Promise<UpstreamStub> {
  const requests: UpstreamStub['requests'] = []

  const server: Server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://127.0.0.1')

    requests.push({
      method: req.method ?? 'GET',
      url: req.url ?? '/',
      headers: req.headers as Record<string, string>,
    })

    const json = (status: number, body: unknown) => {
      res.writeHead(status, { 'content-type': 'application/json' })
      res.end(JSON.stringify(body))
    }

    // --- 登入 ---
    if (req.method === 'POST' && url.pathname === '/auth/login') {
      let raw = ''
      req.on('data', (chunk) => (raw += chunk))
      req.on('end', () => {
        const body = JSON.parse(raw || '{}')
        if (body.password !== 'password1234') {
          return json(401, { message: 'invalid credentials' })
        }
        return json(200, {
          accessToken: 'upstream-secret-access-token',
          refreshToken: 'upstream-secret-refresh-token',
          expiresIn: 3600,
          user: {
            id: 'u-1',
            email: body.email,
            name: 'E2E User',
            roles: ['user'],
            // 刻意多回一個內部欄位，驗證 BFF 會用 schema 把它濾掉
            internalRiskScore: 42,
          },
        })
      })
      return
    }

    // --- 列表 ---
    if (req.method === 'GET' && url.pathname === '/items') {
      const page = Number(url.searchParams.get('page') ?? 1)
      const limit = Number(url.searchParams.get('limit') ?? 20)
      const start = (page - 1) * limit
      return json(200, { items: ITEMS.slice(start, start + limit), total: ITEMS.length })
    }

    // --- 單筆 ---
    if (req.method === 'GET' && url.pathname.startsWith('/items/')) {
      const id = url.pathname.slice('/items/'.length)
      const item = ITEMS.find((entry) => entry.id === id)
      return item ? json(200, item) : json(404, { message: 'not found' })
    }

    // --- 故意回傳壞掉的資料，驗證 BFF 的上游回應驗證 ---
    if (url.pathname === '/broken') {
      return json(200, { items: [{ id: 1, wrongShape: true }], total: 'not-a-number' })
    }

    json(404, { message: 'unknown upstream route' })
  })

  await new Promise<void>((resolve) => server.listen(port, '127.0.0.1', resolve))

  const address = server.address()
  const actualPort = typeof address === 'object' && address ? address.port : port

  return {
    baseUrl: `http://127.0.0.1:${actualPort}`,
    requests,
    close: () =>
      new Promise<void>((resolve, reject) =>
        server.close((err) => (err ? reject(err) : resolve())),
      ),
  }
}
