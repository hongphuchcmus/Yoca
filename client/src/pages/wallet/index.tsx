import { useEffect, useState } from "react";
import Tble from "../../components/Tble.tsx";
import { formatNumber } from "../../util/format.ts";

interface WalletProps {
    address : string
}

export default function WalletPage(props : WalletProps) {
  const [transfers, setTransfers] = useState([]);
  const [loading, setLoading] = useState(true);
  const address = props.address;

  const headers = [
    {
      key: "token",
      header: "Token",
    },
    {
      key: "balance",
      header: "Balance",
    },
    {
      key: "valueUsd",
      header: "Value",
    },
  ];

  useEffect(() => {(async () => {
      try {
        const response = await fetch(`/api/v0/balances/${address}`);
        const data = await response.json();
        const balances = data.map((
          balance: { symbol: string; balance: string; valueUsd: string },
          index: number,
        ) => ({
          id: index,
          token: balance.symbol,
          balance: formatNumber(Number(balance.balance)),
          valueUsd: formatNumber(Number(balance.valueUsd)),
        }));

        setTransfers(balances);
      } catch (error) {
        console.error("Failed to fetch transfers:", error);
      } finally {
        setLoading(false);
      }
    })();
  }, [address]);

  return <Tble loading={loading} rows={transfers} headers={headers} />;
}
