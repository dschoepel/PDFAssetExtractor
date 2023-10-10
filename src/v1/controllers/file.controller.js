const dayjs = require("dayjs");
var customParseFormat = require("dayjs/plugin/customParseFormat");
dayjs.extend(customParseFormat);
const pdfServices = require("../utils/pdfServices");
const fetchSymbol = require("../utils/fetchSymbol");
const uploadFile = require("../middleware/upload");
const path = require("path");
const { table } = require("console");
const directoryPath = path.join(__dirname, "../", "/pdfs");
const baseUrl = "pdfs/";

const extractPdfDetails = async (req, res) => {
  const fileName = req.params.filename;
  console.log(`Starting extractPdfDetails... for ${fileName}`);
  const filePathToPDF = path.join(directoryPath, "/", fileName);
  // Get pdf file to parse
  try {
    await uploadFile(req, res);
    if (req.file == undefined) {
      return res.status(400).send({
        message: "Please upload a file of type pdf!",
        errorStatus: "INVALID_FILE_TYPE",
        errorFlag: true,
      });
    }
    console.log("Processing pdf file: ", req.file.originalname);
    // Valid file, extract details from pdf
    let pdfExtractDetails = await pdfServices
      .extractPDFInfo(req.file.buffer)
      .then((response) => {
        console.log(`extractPdfDetails for ${filePathToPDF} is: `, response);
        return response;
      })
      .catch((error) => {
        console.log("Error extractPdf Details: ", error);
      });

    if (pdfExtractDetails) {
      // console.log("Sorted pages: ", sortPages(pdfExtractDetails));
      // Modify decimal places on x and y coordinates.
      pdfExtractDetails = trimDecimals(pdfExtractDetails, 0, 0);
      const result = await findTables({
        rowsByPage: findRows(sortPages(pdfExtractDetails)),
        columns: 4,
        headings: true,
      });
      // findRows(sortPages(pdfExtractDetails));
      if (result.length != 0) {
        res.status(200).send({
          message: "Symbol table details found in uploaded PDF",
          pdfDetails: result,
          errorFlag: false,
        });
      } else {
        res.status(400).send({
          message: "Unable to locate any symbol tables in uploaded pdf",
          // pdfDetails: pdfExtractDetails,
          // pdfDetails: sortPages(pdfExtractDetails),
          pdfDetails: result,
          errorFlag: true,
        });
      }
    } else {
      res.status(500).send({
        message: `Extracted details error for file ${fileName}`,
        pdfDetails: pdfExtractDetails,
        errorFlag: true,
      });
    }
  } catch (error) {
    const filename = req.file.originalname
      ? req.file.originalname
      : "undefined";
    console.error(error);
    res.status(400).send({
      message: `Could not upload the file: ${filename}.  ${error}`,
      errorStatus: "SYSTEM",
      errorFlag: true,
    });
  }
};

// Sort the extracted page conent by row (y) and column (x)
function sortPages(rawPdfDetail) {
  let sortedPages = [];
  const { pages } = rawPdfDetail;
  for (let p = 0; p < pages.length; p++) {
    const { pageInfo, links, content } = pages[p];
    const sortedContent = content.sort((a, b) => a.y - b.y || a.x - b.x);
    sortedPages.push({ pageInfo, links, sortedContent });
  }
  return sortedPages;
}

// Convert details into page, row objects and return array to be used to find tables.
// Sorted pages is an array of page objects sorted by page and content in row order
// Each Content Object has x (column), y (row), str (string), dir (reading direction),
// width, height, and fontname key/value pairs.
function findRows(sortedPages) {
  // const { pageInfo, links, sortedContent } = sortedPages;
  const numberOfPages = sortedPages.length;
  console.log(`computing rows in ${numberOfPages} pages...`);
  let rowsByPage = [];
  // Process each page placing content into rows
  for (let p = 0; p < numberOfPages; p++) {
    const { sortedContent } = sortedPages[p];
    // get a row (more than two columns by counting columns till row (y) value changes
    let rowIndex = 1;
    const contentLength = sortedContent.length; // number of individual items on the page
    // Look for rows in the content
    let columnArray = [];
    let columns = 0;
    let rowBoundary = 0;
    let rowChanged = true;
    for (let i = 0; i < contentLength; i++) {
      // Use height of content to determine row boundary, sometimes columns
      // are 1 or 2 pixels off of other columns and should be in same row
      if (rowChanged) {
        rowBoundary = sortedContent[i].y + sortedContent[i].height;
        rowChanged = false;
      }
      // Filter out content spaces where str = ""
      if (
        sortedContent[i].str.trim().length >= 1 &&
        sortedContent[i].str !== " "
      ) {
        columnArray.push(sortedContent[i]);
        columns = columns + 1;
      }
      if (
        sortedContent[i] >= contentLength - 1 ||
        sortedContent[i + 1]?.y > rowBoundary
      ) {
        // End of page content or Row changes on next content item
        // Sort columnArray by x coordinate ascending order ltr (left to right)
        columnArray.sort((a, b) => a.x - b.x);
        rowsByPage.push({
          page: p + 1,
          row: rowIndex,
          columnDetail: { columns: columns, columnArray },
        });
        rowIndex = rowIndex + 1;
        columns = 0;
        columnArray = [];
        rowChanged = true;
      } else {
        // Next column is in same row
      }
    } // End for i each content item
  } // End for p each page
  return rowsByPage;
}

// Look for rows with  minimum "columns" having a security symbol.
// Assume headings for tables?
async function findTables({ columns, rowsByPage, headings }) {
  const DEFAULT_COLUMNS = 3;
  const DEFAULT_HEADINGS = false;

  // Look for heading text to name columns or use default column naming
  const hasHeadings = headings ? headings : DEFAULT_HEADINGS;

  // Default number of columns to use for detecting a table if not specified
  const minColumns = columns ? columns : DEFAULT_COLUMNS;

  console.log("columns: ", minColumns, " hasHeadings: ", hasHeadings);
  let symbolRows = [];
  let headerRows = [];
  let headersFoundArray = [];

  // Walk through each row, determine if it has symbol or heading details
  for (let r = 0; r < rowsByPage.length; r++) {
    const { page, row, columnDetail } = rowsByPage[r];

    let symbolFound = "";
    let longName = "";
    let foundASymbol = false;

    if (columnDetail.columns >= minColumns) {
      const tableRow = buildTableRow(columnDetail.columnArray);
      let colWithNumbers = 0;
      // How many columns have a number in them
      for (let col = 0; col < tableRow.row.length; col++) {
        if (Number.isFinite(tableRow.row[col].value)) {
          colWithNumbers++;
        }
      } //End for col

      // If row has 2 or more numbers, is there a symbol
      // (string is between 1 - 5 char long)?
      if (colWithNumbers >= 2) {
        let symbolNotFoundYet = true;
        // Look for a symbol in one of the columns
        for (let col = 0; col < tableRow.row.length; col++) {
          if (
            !Number.isFinite(tableRow.row[col].value) &&
            tableRow.row[col].value !== "CASH"
          ) {
            const colLength = tableRow.row[col].value.length;
            const symbolToTest = tableRow.row[col].value;
            // Make sure symbol is not a date or invalid char

            let validateSymbol = true;
            if (
              foundDate(symbolToTest) ||
              symbolToTest === "-" ||
              symbolToTest === "Buy" ||
              symbolToTest === "Other" ||
              symbolToTest === "TOTAL"
            ) {
              validateSymbol = false;
            }

            if (
              colLength >= 1 &&
              colLength <= 5 &&
              symbolNotFoundYet &&
              validateSymbol
            ) {
              const result = await validSymbolFound(tableRow.row[col].value);
              //   .then((quote) => {
              //   return quote;
              // });
              // console.log("Result:", result);
              foundASymbol = result.success;
              if (foundASymbol) {
                symbolNotFoundYet = false;
              }
              console.log("foundASymbol? ", foundASymbol);
              console.log("result is: ", tableRow.row[col].value, result);
              // longName = foundASymbol ? result.detail[0]?.longName : "";
              longName = foundASymbol ? result.detail?.longName : "";
              // console.log(
              //   "founda symbol, colLength",
              //   foundASymbol,
              //   result.detail[0].longName,
              //   colLength,
              //   tableRow.row[col].value
              // );
              symbolFound = foundASymbol ? tableRow.row[col].value : "";
            } // End if string is between 1-5 charactes
          } // End If column is a string (not a number)
        } // End For col
      } // End If colWithNumbers

      if (foundASymbol) {
        symbolRows.push({
          page: page,
          row: row,
          symbolFound: symbolFound,
          longName: longName,
          tableRow: tableRow,
        });
      } else {
        headerRows.push({
          page: page,
          row: row,
          symbolFound: symbolFound,
          longName: "",
          headerRow: tableRow,
        });
      } // End if a symbol was found
    } // If this row could be part of a table (columns >= minColumns)
  } // End for each row r
  // console.log("headerRows: ", headerRows);
  // Find headings for the symbol tables
  let totalSymbols = symbolRows.length; // Use to loop through each symbol
  let tablesFoundArray = []; // Symbol rows organized by table

  console.log("Total symbols = ", totalSymbols);
  if (totalSymbols > 0) {
    // Initialize stuff
    let tableStartPage = symbolRows[0].page; // Page table starts on
    let tableStartRow = symbolRows[0].row; // Start of table
    let currentColWithNumbers = symbolRows[0].tableRow.columnsWithNumbers;
    let currentRowLength = symbolRows[0].tableRow.row.length;
    let tableNumber = 1; // Counts how many tables were found

    // Identify tables - A new table starts if number of columns changes or
    // the number of columns with numbers changes
    for (let s = 0; s < totalSymbols; s++) {
      const { columnsWithNumbers, row } = symbolRows[s].tableRow;
      if (
        currentColWithNumbers !== columnsWithNumbers ||
        currentRowLength !== symbolRows[s].tableRow.row.length
      ) {
        tableStartPage = symbolRows[s].page;
        tableStartRow = symbolRows[s].row;
        tableNumber = tableNumber + 1;
        currentColWithNumbers = columnsWithNumbers;
        currentRowLength = symbolRows[s].tableRow.row.length;
      } // End If columns with numbers changed or number of columns changed = new table
      tablesFoundArray.push({
        tableNumber: tableNumber,
        page: symbolRows[s].page,
        row: symbolRows[s].row,
        columnsWithNumbers: columnsWithNumbers,
        symbolFound: symbolRows[s].symbolFound,
        longName: symbolRows[s].longName,
        rowDetail: row,
      });
      // Add symbol row to array with its table detail
    } // End for s (locate tables of symbols)
  } // End if Total symbols > 0

  // Look for headings correspodning to tables
  const filteredTables = [];
  let tableNbr = 0;
  // get first entry for each table
  tablesFoundArray.forEach(function (item) {
    if (tableNbr != item.tableNumber) {
      filteredTables.push(item);
      tableNbr = item.tableNumber;
    }
  });

  console.log("filteredtables length: ", filteredTables.length);

  //
  // TODO This logic is setting first table to 2 rather than 1?????
  //

  // If tables were found
  if (filteredTables.length > 0) {
    for (let t = 0; t < filteredTables.length; t++) {
      // Look for header - search rows backwards from first table row
      // Stop if a row is found or at beginning of array
      const { page, row } = filteredTables[t];
      let foundHeader = false;
      let currentPage = page;
      // Assume header on same page
      // Find headers items on current page
      let tempHead = []; // Holds rows from same page
      for (let r = 0; r < headerRows.length; r++) {
        if (headerRows[r].page === currentPage) {
          tempHead.push({ idx: r, ...headerRows[r] });
          // console.log(
          //   "saving header page, row, idx, header[r]",
          //   headerRows[r].page,
          //   headerRows[r].row,
          //   r,
          //   headerRows[r].headerRow.row
          // );
        }
      }
      let headerIndex = -1;
      let z = tempHead.length - 1;
      // console.log(`z = ${z}, temphead length = ${tempHead.length}`);
      for (z; z >= 0 && !foundHeader; z--) {
        // console.log(`Pass ${z}..`);
        if (
          tempHead[z].headerRow.row.length >=
            filteredTables[t].rowDetail.length &&
          tempHead[z].headerRow.columnsWithNumbers < 1 &&
          !foundHeader
        ) {
          headerIndex = tempHead[z].idx;
          foundHeader = true;
        }
        // foundHeader
        //   ? console.log(
        //       `Current page: ${currentPage}, ftable row: ${filteredTables[t].row}, tablecols: ${filteredTables[t].rowDetail.length}, headercols: ${tempHead[z].headerRow.row.length}. found ${foundHeader}`,
        //       tempHead[z].headerRow.row
        //     )
        //   : console.log("");
      }

      // If foundHeader save with table number and then loop through tablesFound
      // and add correct table header detail to each table row
      if (foundHeader) {
        // console.log(
        //   `t = ${t} tableNumber = ${filteredTables[t].tableNumber} header index ${headerIndex}`,
        //   headerRows[headerIndex].headerRow.row
        // );
        headersFoundArray.push({
          tableNbr: filteredTables[t].tableNumber,
          columnHeadings: headerRows[headerIndex].headerRow.row,
        });
      }
    } // End for t (find header for each table t)
  } // End if filteredTables (tables were found)

  // Add matching heading (col) to table row column
  let symbolTable = [];
  if (tablesFoundArray.length > 0) {
    // console.log("tablefound array", tablesFoundArray);
    tablesFoundArray.forEach((tableRow) => {
      // Find header
      const findHeading = (heading) => {
        return tableRow.tableNumber === heading.tableNbr;
      };
      // console.log("findheading", tableRow.tableNumber);
      const headingIndex = headersFoundArray.findIndex(findHeading);
      // console.log(
      //   `table number for row ${tableRow.tableNumber}, heading index ${headingIndex}`
      // );

      // console.log(
      //   "Heading index: ",
      //   headingIndex,
      //   tableRow.tableNumber,
      //   tableRow
      // );

      const { tableNumber, symbolFound, rowDetail, longName } = tableRow;
      // console.log("headersfound array", headersFoundArray, headingIndex);
      // TODO if index is -1 then go to next tablerow...
      // console.log("longName is: ", longName);
      if (headingIndex >= 0) {
        const { columnHeadings } = headersFoundArray[headingIndex];
        const mergedRowDetail = mergeHeaderWithRowDetail(
          rowDetail,
          columnHeadings
        );

        // TODO Build a proposed lot record from the merged details
        const lot = buildLot(mergedRowDetail);

        // console.log("merged row detail, ", mergedRowDetail);
        symbolTable.push({
          table: tableNumber,
          symbol: symbolFound,
          longName: longName,
          columns: mergedRowDetail,
          lot: lot,
          // columnHeadings: columnHeadings,
        });
      }
    });
  } else {
    // No headers were found for tables
  }
  // return rowsByPage;
  // console.log(symbolTable);
  return symbolTable;
} // End findTables

function mergeHeaderWithRowDetail(rowDetail, columnHeadings) {
  const mergedRowDetail = [];
  // console.log("Checking row detail value: ", rowDetail);
  for (col = 0; col < rowDetail.length; col++) {
    // Test for a date in the column
    if (
      !Number.isFinite(rowDetail[col].value) &&
      dayjs(rowDetail[col].value, [
        "MM-DD",
        "MM-DD-YY",
        "MM-DD-YYYY",
        "MMM-DD-YYYY",
        "M-D-YY",
        "M-D-YYYY",
        "YYYY-M-D",
        "YYYY-MM-DD",
        "YY-M-D",
        "YY-MM-DD",
      ]).isValid()
    ) {
      const formattedDate = dayjs(rowDetail[col].value, [
        "MM-DD",
        "MM-DD-YY",
        "MM-DD-YYYY",
        "MMM-DD-YYYY",
        "M-D-YY",
        "M-D-YYYY",
      ]).valueOf();
      rowDetail[col].value = formattedDate;
    }
    // console.log(
    //   "Heading details: ",
    //   columnHeadings.length,
    //   col,
    //   rowDetail.length,
    //   rowDetail
    // );
    // console.log("formatted date", rowDetail[col]);
    mergedRowDetail.push({
      ...rowDetail[col],
      heading:
        col > columnHeadings.length - 1 ? "N/F" : columnHeadings[col].value,
    });
  }
  return mergedRowDetail;
}

async function validSymbolFound(symbol) {
  const { success, detail } = await fetchSymbol
    .lookUpSymbol(symbol)
    .then((response) => {
      // console.log(`extractPdfDetails for ${filePathToPDF} is: `, response);
      return response;
    })
    .catch((error) => {
      console.log("Error fetching symbol details Details: ", error);
    });
  // console.log("Symbold found: ", success, detail[0]?.longName);
  return { success, detail };
}

function buildTableRow(columnArray) {
  let row = [];
  let format = /[$+\-.]/;
  let stringFormat = /[^0-9,^$,^\-,^+,^.,a-z]/;
  let integerForamt = /^[0-9]+$/;
  let parenFormat = /\(([^)]+)\)/;
  let colNumber = 1;
  let columnsWithNumbers = 0;

  // If string is a dolar sign ignore the column
  for (let c = 0; c < columnArray.length; c++) {
    const { str } = columnArray[c];
    if (colNumber === 2) {
      // console.log("col 2: ", str);
    }

    if (str !== "$" && str !== ".") {
      let value = str;
      const isAnInteger = integerForamt.test(str);
      const isAString = stringFormat.test(str) || str === "-" ? true : false;
      const isANumber = format.test(str);
      let isANegativeNumber = false;
      let negNbr = 0;
      // Is this a negative number (surrounded in parentheses)
      if (parenFormat.test(str)) {
        const matchArray = str.match(parenFormat);
        if (matchArray) {
          const nbrString = matchArray[1].replace(/\,/g, "");
          if (!isNaN(nbrString)) {
            negNbr = Number.parseFloat(nbrString) * -1;
            isANegativeNumber = true;
            // console.log(`A negative number was found in ${str} as ${negNbr}!`);
          }
        }
      }

      // Is this a positive or negative number?
      if ((isANumber && !isAString) || isANegativeNumber || isAnInteger) {
        if (isANegativeNumber) {
          value = negNbr;
        } else {
          value = Number(str.replace(/[^0-9\.-]+/g, ""));
        }
        if (value !== value) {
          value = str;
        }
        if (Number.isFinite(value)) {
          columnsWithNumbers++;
        }
      }
      row.push({ title: `Col-${colNumber}`, value: value });
      colNumber++;
    }
  } // End If str !== $ && !== .
  return { columnsWithNumbers: columnsWithNumbers, row: row };
}

function trimDecimals(rawPdfDetail, yDecimals, xDecimals) {
  const { pages } = rawPdfDetail;
  for (let p = 0; p < pages.length; p++) {
    const { pageInfo, links, content } = pages[p];
    for (let c = 0; c < content.length; c++) {
      content[c].y = truncateDecimals(content[c].y, yDecimals);
      content[c].x = truncateDecimals(content[c].x, xDecimals);
    } // End of for each content item
  } // End for each page p
  return rawPdfDetail;
}

function truncateDecimals(num, digits) {
  var numS = num.toString(),
    decPos = numS.indexOf("."),
    substrLength = decPos == -1 ? numS.length : 1 + decPos + digits,
    trimmedResult = numS.substr(0, substrLength),
    finalResult = isNaN(trimmedResult) ? 0 : trimmedResult;

  return parseFloat(finalResult);
}

function buildLot(mergedRowDetail) {
  // Heading search constants, assume search string is converted to lowercase
  const SYMBOL_TEXT = ["symbol", "cusip", "symbols"];
  const QUANTITY_TEXT = ["qty", "quantity"];
  const DATE_TEXT = ["date"];
  const DESCRIPTION_TEXT = ["name", "description", "symbol"];
  const BASIS_TEXT = ["basis"];
  const MARKET_TEXT = ["market"];

  const rowLength = mergedRowDetail.length;
  let lotObject = {};
  let basisFound = false;
  let marketFound = false;
  let dateFound = false;

  mergedRowDetail.forEach((col, index) => {
    let { title, value, heading } = col;

    // Avoid undefined heading values
    if (!heading) {
      heading = "";
    }

    switch (true) {
      case foundItem(SYMBOL_TEXT, heading): {
        // Found symbol heading
        // console.log("Found symbol heading", heading, value);
        if (isNaN(value)) {
          lotObject = { ...lotObject, symbol: value };
        }
        break;
      }
      case foundItem(DESCRIPTION_TEXT, heading): {
        // Found description heading
        // console.log("Found description heading", heading, value);
        if (isNaN(value)) {
          lotObject = { ...lotObject, description: value };
        }
        break;
      }
      case foundItem(DATE_TEXT, heading): {
        // Found date heading
        // console.log("Found date heading", heading, value);

        if (value !== value || value === "-") {
          dateFound = false;
        } else {
          dateFound = true;
          lotObject = { ...lotObject, date: value };
        }
        break;
      }
      case foundItem(QUANTITY_TEXT, heading): {
        // Found quantity heading
        // console.log("Found quantity heading", heading, value);
        lotObject = { ...lotObject, qty: value };
        break;
      }
      case foundItem(BASIS_TEXT, heading): {
        // Found basis heading
        // console.log("Found basis heading", heading, value);
        if (!isNaN(value)) {
          basisFound = true;
          lotObject = { ...lotObject, costBasis: value };
        }
        break;
      }
      case foundItem(MARKET_TEXT, heading): {
        // Found market heading
        // console.log("Found market heading", heading, value);
        marketFound = true;
        lotObject = { ...lotObject, market: value };
        break;
      }
      default: {
      }
    }

    // Caluculate unit price using the qty - favor basis cost then market if no basis
    let price = 0;
    if (!isNaN(lotObject.qty)) {
      if (basisFound && lotObject.basis > 0) {
        price = lotObject.basis / lotObject.qty;
      } else if (marketFound && lotObject.market > 0) {
        price = lotObject.market / lotObject.qty;
      }
    }
    const costBasis = !basisFound ? lotObject.qty * price : lotObject.costBasis;
    lotObject = { ...lotObject, unitPrice: price, costBasis: costBasis };
  });

  // Ensure the lot has a date, if no date use todays date
  // if (!dateFound) {
  //   const date = dayjs().valueOf();
  //   lotObject = { ...lotObject, date: date };
  // }
  // console.log("lot object is: ", lotObject);

  return lotObject;
}

// Look for a specfic value (array of search strings) in a column heading
function foundItem(SEARCH_FOR_STRINGS, string) {
  const foundString = SEARCH_FOR_STRINGS.some((item) =>
    string.toLowerCase().includes(item)
  );
  return foundString;
}

function foundDate(string) {
  const foundDate = dayjs(string, [
    "MM-DD",
    "MM-DD-YY",
    "MM-DD-YYYY",
    "MMM-DD-YYYY",
    "M-D-YY",
    "M-D-YYYY",
    "YYYY-M-D",
    "YYYY-MM-DD",
    "YY-M-D",
    "YY-MM-DD",
  ]).isValid();
  return foundDate;
}

module.exports = { extractPdfDetails };
