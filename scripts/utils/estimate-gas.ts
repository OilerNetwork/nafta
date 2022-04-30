import axios from "axios";

export async function getCurrentGas(apiKey: string) {
  const url = `https://api.etherscan.io/api?module=gastracker&action=gasoracle&apikey=${apiKey}`;
  return parseInt((await axios.get(url)).data.result.ProposeGasPrice);
}
