const fetch = require("node-fetch");
const yahooFinance = require("yahoo-finance2").default;

// Look Up Symbol
async function lookUpSymbol(symbol) {
  let options = { method: "GET" };

  // v6 or v7 work, try each if one does not work NOW: Migrated to yahoo-finance2
  // const url = `https://query1.finance.yahoo.com/v6/finance/quote?symbols=${symbol}`;
  // const newUrl = `https://query1.finance.yahoo.com/v11/finance/quoteSummary/${symbol}?modules=financialData`;
  // const backupUrl = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${symbol}`;
  let detail = {};

  let retry = 0; // retry counter to get quote
  let maxRetries = 5;
  let success = false; // Flag a successful quote request
  let notASymbol = false;
  let quote = {};

  try {
    quote = await yahooFinance.quote(symbol).then((quote) => {
      if (quote) {
        if (symbol.toUpperCase() != "SALE") {
          success = true;
        } else {
          success = false;
          notASymbol = true;
        }
      }
      return quote;
    });
  } catch (error) {
    console.log("Error on fetch symbol", symbol, error);
  }

  // const regularMarketPrice = quote.regularMarketPrice;
  // success = true;

  // while (retry < maxRetries && !success && !notASymbol) {
  //   await fetch(url, options)
  //     .then((res) => res.json())
  //     .then((json) => {
  //       detail = json.quoteResponse.result.filter(
  //         (quote) => quote.symbol === symbol
  //       );

  //       if (!detail) {
  //         // TODO handle errors here
  //         console.log(
  //           "Symbol Fetch error - result missing",
  //           data?.quoteResponse
  //         );
  //       } else {
  //         // Found symbol
  //         if (symbol.toUpperCase() != "SALE" && detail.length > 0) {
  //           success = true;
  //         } else {
  //           success = false;
  //           notASymbol = true;
  //         }
  //         return { success: success, ...detail[0] };
  //       } // If !detail (symbol not found)
  //     })
  //     .catch((err) => {
  //       // TODO handle errors
  //       console.error("error symbol - error:", symbol, err);
  //     });
  //   retry = retry + 1; //Somtimes Yahoo rejects requests, try again if needed
  //   // if (retry === maxRetries && url != backupUrl) {
  //   //   retry = 0;
  //   //   url = backupUrl;
  //   // }
  // }

  // console.log("fetch quote detail: ", success, detail);
  console.log(`Looked up ${symbol}: `, quote);

  return { success, detail: quote };
  // return { success, detail };
}

module.exports = { lookUpSymbol };
