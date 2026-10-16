import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect,it } from 'vitest';
import { ScenarioDistribution } from '../components/ScenarioDistribution';
import { scenarioLabels } from '../lib/scenario-math';
import type { ResearchRun } from '../lib/types';
it('shows all five outcomes, computed returns, sources and the assumption caveat',()=>{
 const run={asOfPrice:100,marketAsOf:'2026-10-08',highlights:['Sales growing'],risks:['Funding risk'],scenarioDistribution:{targetDate:'2027-10-08',basis:'Earnings per share × P/E',weightReason:'Illustrative',gaps:[],cases:scenarioLabels.map((label,i)=>({label,price:[20,70,110,150,200][i],weight:20,drivers:'Operating outcome',metricPerShare:10,multiple:10,netCashPerShare:0,startingEvidence:'Reported results',evidenceDate:'2026-09-01',assumptions:'Forecast assumption',sources:['https://issuer.example']}))}} as unknown as ResearchRun;
 const html=renderToStaticMarkup(React.createElement(ScenarioDistribution,{run}));
 expect(html).toContain('Severe bear');expect(html).toContain('Severe bull');expect(html).toContain('$110.00');expect(html).toContain('+10.0%');expect(html).toContain('not statistically validated probabilities');expect(html).toContain('href="https://issuer.example"');expect(html).toContain('Explore my own scenarios');
});
it('does not fabricate new cases for immutable archived reports',()=>{const run={asOfPrice:100,highlights:[],risks:[]} as unknown as ResearchRun;const html=renderToStaticMarkup(React.createElement(ScenarioDistribution,{run}));expect(html).toContain('original conclusions are preserved');expect(html).not.toContain('Weighted outcome under');});
