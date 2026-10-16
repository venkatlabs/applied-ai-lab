import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { completionState } from '../lib/research-completion';
import { factorKeys } from '../lib/investment';
import type { ResearchRun } from '../lib/types';
const mocks = vi.hoisted(() => ({ run: vi.fn(), save: vi.fn(), read: vi.fn(), budget: vi.fn(), today: vi.fn(), claim: vi.fn() }));
vi.mock('@/lib/research-engine', () => ({ runResearch: mocks.run }));
vi.mock('@/lib/server/archive', () => ({ saveSnapshot: mocks.save, readSnapshots: mocks.read }));
vi.mock('@/lib/server/research-budget', () => ({ researchBudget: mocks.budget, sameDayReport: mocks.today, claimResearchSlot: mocks.claim }));
import { GET, POST } from '../app/api/analyze/route';
const run = { id: 'd3ba6b18-fd36-4d45-86d0-fa8b59ce3489', ticker: 'TEST', dataMode: 'live', asOfPrice: 100, analyzedAt: '2026-10-07T12:00:00Z', marketAsOf: '2026-10-07T10:00:00Z', investmentCase: {valuationBasis:'Unavailable',valuationBenchmark:'Missing', factors:Object.fromEntries(factorKeys.map(k=>[k,{rating:k==='valuation'?'Unknown':'Strong',sources:[],reason:'Missing',evidenceDate:'2026-10-07'}]))} } as unknown as ResearchRun;
const request = (input: object) => new NextRequest('https://example.com/api/analyze', { method: 'POST', headers: { origin: 'https://example.com', 'Content-Type': 'application/json' }, body: JSON.stringify(input) });
beforeEach(() => { vi.resetAllMocks(); mocks.budget.mockResolvedValue({remaining:5}); mocks.save.mockImplementation(async r=>r); mocks.run.mockResolvedValue(run); mocks.read.mockResolvedValue([run]); });
afterEach(() => vi.unstubAllEnvs());
describe('research follow-up API', () => {
  it('does no paid work on GET', () => { expect(GET().status).toBe(405); expect(mocks.run).not.toHaveBeenCalled(); });
  it('reserves a slot and targets the owned report gaps', async () => {
    const response = await POST(request({ticker:'TEST',complete:true,reportId:run.id}));
    expect(response.status).toBe(200);
    expect(mocks.claim).toHaveBeenCalledTimes(1);
    expect(mocks.run).toHaveBeenCalledWith('TEST', completionState(run).gaps);
  });
  it('reuses a completed follow-up instead of repeatedly spending', async () => {
    mocks.today.mockResolvedValue({...run,researchCompletion:{...completionState(run),attempted:true}});
    const response = await POST(request({ticker:'TEST',complete:true}));
    expect((await response.json()).reused).toBe(true);
    expect(mocks.run).not.toHaveBeenCalled();
    expect(mocks.claim).not.toHaveBeenCalled();
  });
  it('stops when the global research budget cannot allow the follow-up', async () => {
    mocks.budget.mockResolvedValue({reason:'Budget reached'});
    expect((await POST(request({ticker:'TEST',complete:true,reportId:run.id}))).status).toBe(429);
    expect(mocks.run).not.toHaveBeenCalled();
  });
});
