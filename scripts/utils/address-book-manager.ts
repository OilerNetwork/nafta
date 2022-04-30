import * as path from "path";
import * as fs from "fs";

const addressBookPath = "../../addressBook.json";

export function loadAddressBook(networkId: number) {
  let addressBook = require(path.join(__dirname, addressBookPath));
  if (addressBook[networkId] === undefined) addressBook[networkId] = {};
  let addresses = addressBook[networkId];
  if (addresses === undefined) addressBook[networkId] = {};
  return addressBook;
}

export function saveAddressBook(addressBook: Record<string, Record<string, string>>) {
  fs.writeFileSync(path.join(__dirname, addressBookPath), JSON.stringify(addressBook, null, 2));
}
