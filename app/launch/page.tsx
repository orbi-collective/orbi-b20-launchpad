import { LaunchFlow } from "@/components/launch/launch-flow";

export const metadata = {
  title: "Launch a B20 token",
  description: "Deploy a native B20 token on Base in one transaction."
};

export default function LaunchPage() {
  return (
    <main className="page launch-page">
      <header className="launch-header">
        <h1>Launch a native B20</h1>
        <p>
          Deploy an Asset or Stablecoin token straight from the Base Factory precompile. No Solidity, no contract to verify later: the token
          is native to the chain. Mint, cap, and policy are set in the same transaction.
        </p>
      </header>
      <LaunchFlow />
    </main>
  );
}
