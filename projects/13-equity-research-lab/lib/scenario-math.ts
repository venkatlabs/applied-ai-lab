export const scenarioLabels = ['Severe bear', 'Bear', 'Base', 'Bull', 'Severe bull'] as const;
export function distributionSummary(cases: {price:number;weight:number}[], currentPrice:number) {
  if(!Number.isFinite(currentPrice)||currentPrice<=0||!cases.length||cases.some(c=>!Number.isFinite(c.price)||c.price<0||!Number.isFinite(c.weight)||c.weight<0||c.weight>100)||Math.abs(cases.reduce((s,c)=>s+c.weight,0)-100)>0.000001) return null;
  const price=cases.reduce((s,c)=>s+c.price*c.weight/100,0);
  if(!Number.isFinite(price)||!Number.isFinite(price/currentPrice)||cases.some(c=>!Number.isFinite(c.price/currentPrice))) return null;
  const mass=(condition:(price:number)=>boolean)=>cases.filter(c=>condition(c.price)).reduce((s,c)=>s+c.weight,0);
  return {price,returnPct:(price/currentPrice-1)*100,gain:mass(p=>p>currentPrice),loss:mass(p=>p<currentPrice),flat:mass(p=>p===currentPrice),
    largeLoss:mass(p=>p<=currentPrice*.8),largeGain:mass(p=>p>=currentPrice*1.5)};
}
