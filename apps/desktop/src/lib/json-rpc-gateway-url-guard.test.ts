// connect() must reject malformed WS URLs loudly instead of letting
// `new WebSocket()` coerce them. The failure this guards against is real:
// a stale compiled websocket-url.js (predating the #68250 { ok, wsUrl }
// IPC contract) returned the whole result object, and the browser dialed
// "ws://<page-origin>/[object%20Object]" — an opaque, unfixable-looking
// "Could not connect to Hermes gateway" boot loop.

import { JsonRpcGatewayClient } from '@hermes/shared'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

class FakeSocket {
  static OPEN = 1
  readyState = 0
  addEventListener = vi.fn((type: string, handler: () => void) => {
    if (type === 'open') {
      // Land the handshake asynchronously like a real socket.
      setTimeout(() => {
        this.readyState = FakeSocket.OPEN
        handler()
      }, 0)
    }
  })
  removeEventListener = vi.fn()
  close = vi.fn()
  send = vi.fn()
}

describe('JsonRpcGatewayClient connect() URL guard', () => {
  beforeEach(() => {
    // jsdom has no WebSocket; the class reads WebSocket.OPEN when a socket exists.
    vi.stubGlobal('WebSocket', FakeSocket)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('rejects a non-string (an IPC result object passed through whole)', async () => {
    const client = new JsonRpcGatewayClient()
    await expect(
      client.connect({ ok: true, wsUrl: 'ws://127.0.0.1:1/api/ws' } as unknown as string)
    ).rejects.toThrow(/requires a ws:\/\/ or wss:\/\/ URL string, got type "object"/)
  })

  it('rejects a string that is not a ws:// or wss:// URL', async () => {
    const client = new JsonRpcGatewayClient()
    await expect(client.connect('http://127.0.0.1:1234/api/ws')).rejects.toThrow(
      /requires a ws:\/\/ or wss:\/\/ URL string/
    )
  })

  it('does not flip connection state when rejecting a malformed URL', async () => {
    const client = new JsonRpcGatewayClient()
    await client.connect(undefined as unknown as string).catch(() => undefined)
    expect(client.connectionState).toBe('idle')
  })

  it('accepts ws:// and wss:// URL strings', async () => {
    for (const url of ['ws://127.0.0.1:1234/api/ws?token=t', 'wss://gw.example.com/api/ws?ticket=t']) {
      const client = new JsonRpcGatewayClient({ socketFactory: () => new FakeSocket() as unknown as WebSocket })
      await client.connect(url)
      expect(client.connectionState).toBe('open')
    }
  })
})
