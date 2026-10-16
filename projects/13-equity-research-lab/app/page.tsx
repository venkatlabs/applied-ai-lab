import { MyStocks } from '@/components/MyStocks';
import { PortfolioHome } from '@/components/PortfolioHome';

export default function Home() {
  return <>
    <MyStocks />
    <details className="portfolio-details">
      <summary>Portfolio mix, concentration and position sizing</summary>
      <div className="embedded"><PortfolioHome /></div>
    </details>
  </>;
}
