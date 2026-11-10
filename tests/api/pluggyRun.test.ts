import { describe, it, expect, vi } from 'vitest'
import { inspect, registerItem, mapAccount, runSync, readStatus, setStartDate, type Deps } from '../../api/_lib/pluggyRun'
import { PluggyError } from '../../api/_lib/pluggyClient'
import type { SyncPayload } from '../../src/lib/syncService'

const NOW = new Date('2026-11-09T10:00:00.000Z')
const empty = (): SyncPayload => ({ manual_months: [], goals: [], recurring_items: [], investment_positions: [], card_accounts: [{ id: 'card-alan', name: 'Alan', dueDay: 10 }] })

function makeDeps(over: Partial<Deps['client']> = {}, initial: SyncPayload = empty()) {
  let stored: SyncPayload = initial
  const client = {
    getItem: vi.fn(async () => ({ id: 'it', status: 'UPDATED', consentExpiresAt: '2027-11-01T00:00:00.000Z', connector: { name: 'MeuPluggy' } })),
    getCreditAccounts: vi.fn(async () => [{ id: 'acc1', type: 'CREDIT', name: 'Caixa Visa', number: '1234', creditData: { balanceCloseDate: '2026-11-03', balanceDueDate: '2026-11-10' } }]),
    getBills: vi.fn(async () => []),
    getTransactions: vi.fn(async () => [{ id: 't1', description: 'MERCADO BOM', amount: 100, type: 'DEBIT', date: '2026-11-05T15:00:00.000Z', status: 'POSTED', category: null }]),
    ...over,
  }
  const deps: Deps = {
    client: client as unknown as Deps['client'],
    load: async () => stored,
    save: vi.fn(async (p: SyncPayload) => { stored = p }),
    now: () => NOW,
  }
  return { deps, client, get: () => stored }
}

describe('pluggyRun', () => {
  it('registerItem valida uuid', async () => {
    const { deps } = makeDeps()
    await expect(registerItem(deps, 'nao-e-uuid')).rejects.toThrow(/ID da conexão/)
  })
  it('registerItem grava item e contas sem cartão', async () => {
    const { deps, get } = makeDeps()
    const v = await registerItem(deps, '11111111-2222-3333-4444-555555555555')
    expect(v.connected).toBe(true)
    expect(v.accounts).toEqual([{ id: 'acc1', name: 'Caixa Visa', last4: '1234', cardId: null }])
    expect(get().pluggy?.itemId).toBe('11111111-2222-3333-4444-555555555555')
  })
  it('mapAccount liga a conta e rejeita cartão inexistente', async () => {
    const { deps } = makeDeps()
    await registerItem(deps, '11111111-2222-3333-4444-555555555555')
    await expect(mapAccount(deps, 'acc1', 'nao-existe')).rejects.toThrow(/Cartão/)
    expect((await mapAccount(deps, 'acc1', 'card-alan')).accounts[0].cardId).toBe('card-alan')
  })
  it('runSync cria lançamentos só de conta ligada e grava lastResult', async () => {
    const { deps, client, get } = makeDeps()
    await registerItem(deps, '11111111-2222-3333-4444-555555555555')
    let v = await runSync(deps)
    expect(client.getTransactions).not.toHaveBeenCalled()
    expect(v.lastResult?.created).toBe(0)
    await mapAccount(deps, 'acc1', 'card-alan')
    // força passar do guard de 60 s
    get().pluggy!.lastResult = { ...get().pluggy!.lastResult!, at: '2026-11-09T09:00:00.000Z' }
    v = await runSync(deps)
    expect(v.lastResult).toMatchObject({ ok: true, created: 1 })
    expect(v.lastSyncAt).toBe(NOW.toISOString())
    expect(client.getTransactions).toHaveBeenCalledWith('acc1', '2026-10-04', '2026-11-10')
  })
  it('runSync em < 60 s devolve o resultado anterior sem chamar a Pluggy', async () => {
    const { deps, client } = makeDeps()
    await registerItem(deps, '11111111-2222-3333-4444-555555555555')
    await runSync(deps)
    client.getItem.mockClear()
    await runSync(deps)
    expect(client.getItem).not.toHaveBeenCalled()
  })
  it('falha na Pluggy grava ok=false e mantém lastSyncAt', async () => {
    const { deps, get } = makeDeps({ getCreditAccounts: vi.fn(async () => { throw new Error('boom') }) })
    await registerItem(deps, '11111111-2222-3333-4444-555555555555').catch(() => {})
    get().pluggy = { itemId: 'it', itemStatus: 'UPDATED', itemError: null, consentExpiresAt: null, accounts: [], lastSyncAt: '2026-11-08T10:00:00.000Z', lastResult: null, seen: {} }
    const v = await runSync(deps)
    expect(v.lastResult?.ok).toBe(false)
    expect(v.lastSyncAt).toBe('2026-11-08T10:00:00.000Z')
  })
  it('falha por conta informa etapa e status', async () => {
    const { deps, get } = makeDeps({ getBills: vi.fn(async () => { throw new PluggyError('Pluggy respondeu 403: NOT_AVAILABLE', 403) }) })
    await registerItem(deps, '11111111-2222-3333-4444-555555555555')
    await mapAccount(deps, 'acc1', 'card-alan')
    get().pluggy!.lastResult = null
    const v = await runSync(deps)
    expect(v.lastResult?.error).toContain('faturas')
    expect(v.lastResult?.error).toContain('403')
    expect(v.lastResult?.error).toContain('NOT_AVAILABLE')
  })
  it('falha em getTransactions marca etapa compras', async () => {
    const { deps, get } = makeDeps({ getTransactions: vi.fn(async () => { throw new Error('x') }) })
    await registerItem(deps, '11111111-2222-3333-4444-555555555555')
    await mapAccount(deps, 'acc1', 'card-alan')
    get().pluggy!.lastResult = null
    const v = await runSync(deps)
    expect(v.lastResult?.error).toContain('compras')
    expect(v.lastResult?.error).toContain('erro inesperado')
  })
  it('status de erro do item é exposto', async () => {
    const { deps } = makeDeps({ getItem: vi.fn(async () => ({ id: 'it', status: 'LOGIN_ERROR', error: { code: 'USER_AUTHORIZATION_EXPIRED' } })) })
    await registerItem(deps, '11111111-2222-3333-4444-555555555555')
    const v = await readStatus(deps)
    expect(v).toMatchObject({ itemStatus: 'LOGIN_ERROR', itemError: 'USER_AUTHORIZATION_EXPIRED' })
  })
  it('runSync preserva cardId mapeado durante o sync em andamento', async () => {
    const { deps } = makeDeps()
    await registerItem(deps, '11111111-2222-3333-4444-555555555555')
    await mapAccount(deps, 'acc1', 'card-alan')
    let first = true
    const base = await deps.load()
    const racing: Deps = {
      ...deps,
      load: async () => {
        const p = (await deps.load())!
        if (first) { first = false; return p }
        // segunda leitura: usuário trocou o vínculo no meio do sync
        return { ...p, pluggy: { ...p.pluggy!, accounts: p.pluggy!.accounts.map(a => ({ ...a, cardId: null })) } }
      },
    }
    expect(base?.pluggy?.accounts[0].cardId).toBe('card-alan')
    // roda sync (passa o guard: sem lastResult)
    const v = await runSync(racing)
    expect(v.accounts[0].cardId).toBeNull()
  })
  it('registerItem com item novo (reconectar) leva o cardId pela last4 e zera lastResult', async () => {
    const prevAcc = { id: 'accOld', name: 'Caixa Visa', last4: '1234', cardId: 'card-alan', closeDate: '2026-11-03', dueDate: '2026-11-10', syncedOnce: true }
    const initial: SyncPayload = { ...empty(), pluggy: {
      itemId: 'aaaaaaaa-2222-3333-4444-555555555555', itemStatus: 'UPDATED', itemError: null, consentExpiresAt: null,
      accounts: [prevAcc], lastSyncAt: '2026-11-08T10:00:00.000Z',
      lastResult: { at: '2026-11-08T10:00:00.000Z', ok: true, created: 3, updated: 0, moved: 0, removed: 0, skippedDuplicates: 0 }, seen: {},
    } }
    const { deps, get } = makeDeps({
      getCreditAccounts: vi.fn(async () => [{ id: 'accNew', type: 'CREDIT', name: 'Caixa Visa', number: '9999 1234', creditData: { balanceCloseDate: '2026-11-03', balanceDueDate: '2026-11-10' } }]),
    }, initial)
    const v = await registerItem(deps, '11111111-2222-3333-4444-555555555555')
    expect(v.accounts).toEqual([{ id: 'accNew', name: 'Caixa Visa', last4: '1234', cardId: 'card-alan' }])
    expect(v.lastResult).toBeNull()
    expect(get().pluggy?.accounts[0].syncedOnce).toBe(false)
  })
  it('runSync aceita datas ISO da Pluggy (conta e faturas)', async () => {
    const { deps, client, get } = makeDeps({
      getCreditAccounts: vi.fn(async () => [{ id: 'acc1', type: 'CREDIT', name: 'Caixa Visa', number: '1234', creditData: { balanceCloseDate: '2026-11-03T00:00:00.000Z', balanceDueDate: '2026-11-10T00:00:00.000Z' } }]),
      getBills: vi.fn(async () => [{ id: 'b', dueDate: '2026-10-10T00:00:00.000Z', billClosingDate: '2026-10-03T00:00:00.000Z' }]),
    } as never)
    await registerItem(deps, '11111111-2222-3333-4444-555555555555')
    await mapAccount(deps, 'acc1', 'card-alan')
    get().pluggy!.lastResult = undefined
    const v = await runSync(deps)
    expect(v.lastResult?.ok).toBe(true)
    expect(client.getTransactions).toHaveBeenCalledWith('acc1', '2026-10-04', '2026-11-10')
  })
  it('inspect devolve campos brutos e não grava', async () => {
    const { deps, get } = makeDeps({
      getBillsRaw: vi.fn(async () => [{ id: 'bill-abcdef123456', dueDate: '2026-11-10T00:00:00.000Z', billClosingDate: '2026-11-03T00:00:00.000Z' }]),
    } as never)
    await registerItem(deps, '11111111-2222-3333-4444-555555555555')
    await mapAccount(deps, 'acc1', 'card-alan')
    const saves = (deps.save as ReturnType<typeof vi.fn>).mock.calls.length
    const before = JSON.stringify(get())
    const r = await inspect(deps)
    expect((deps.save as ReturnType<typeof vi.fn>).mock.calls.length).toBe(saves)
    expect(JSON.stringify(get())).toBe(before)
    expect(r.item).toMatchObject({ status: 'UPDATED', consentExpiresAt: '2027-11-01T00:00:00.000Z' })
    expect(r.accounts[0]).toMatchObject({ id: 'acc1', number: '1234', balanceCloseDate: '2026-11-03' })
    expect(r.cards[0].bills[0]).toEqual({ idTail: '123456', dueDate: '2026-11-10T00:00:00.000Z', billClosingDate: '2026-11-03T00:00:00.000Z' })
    expect(r.cards[0].transactions[0]).toMatchObject({ idTail: 't1', amount: 100, ignored: false, signedValue: 100, installment: null, seen: null })
  })
  it('inspect sem conexão lança', async () => {
    const { deps } = makeDeps()
    await expect(inspect(deps)).rejects.toThrow(/Nenhuma conexão/)
  })
})

describe('pluggyRun - data inicial', () => {
  const UUID = '11111111-2222-3333-4444-555555555555'
  it('setStartDate grava e devolve no status; registerItem preserva', async () => {
    const { deps, get } = makeDeps()
    await registerItem(deps, UUID)
    expect((await readStatus(deps)).startDate).toBeNull()
    const v = await setStartDate(deps, '2026-11-01')
    expect(v.startDate).toBe('2026-11-01')
    expect(get().pluggy?.startDate).toBe('2026-11-01')
    await registerItem(deps, UUID)
    expect(get().pluggy?.startDate).toBe('2026-11-01')
    expect((await setStartDate(deps, null)).startDate).toBeNull()
  })
  it('setStartDate rejeita formato inválido', async () => {
    const { deps } = makeDeps()
    await registerItem(deps, UUID)
    await expect(setStartDate(deps, '01/11/2026')).rejects.toThrow(/inválida/)
    await expect(setStartDate(deps, '2026-13-01')).rejects.toThrow(/inválida/)
  })
  it('setStartDate rejeita data futura (apagaria itens) e aceita hoje', async () => {
    const { deps } = makeDeps()
    await registerItem(deps, UUID)
    await expect(setStartDate(deps, '2026-11-10')).rejects.toThrow(/Data inicial inválida/)
    expect((await setStartDate(deps, '2026-11-09')).startDate).toBe('2026-11-09')
  })
  it('runSync começa a janela na data inicial quando ela é posterior', async () => {
    const { deps, client, get } = makeDeps()
    await registerItem(deps, UUID)
    await mapAccount(deps, 'acc1', 'card-alan')
    await setStartDate(deps, '2026-11-01')
    get().pluggy!.lastResult = null
    await runSync(deps)
    expect(client.getTransactions).toHaveBeenCalledWith('acc1', '2026-11-01', '2026-11-10')
  })
  it('runSync mantém a janela normal quando a data inicial é anterior', async () => {
    const { deps, client, get } = makeDeps()
    await registerItem(deps, UUID)
    await mapAccount(deps, 'acc1', 'card-alan')
    await setStartDate(deps, '2026-01-01')
    get().pluggy!.lastResult = null
    await runSync(deps)
    expect(client.getTransactions).toHaveBeenCalledWith('acc1', '2026-10-04', '2026-11-10')
  })
})
