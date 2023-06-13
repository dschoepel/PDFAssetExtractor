const PDFExtract = require("pdf.js-extract").PDFExtract;

const PDFExtractOptions = {
  firstPage: 1, // default:`1` - start extract at page nr
  lastPage: 1, //  stop extract at page nr, no default value
  password: "password", //  for decrypting password-protected PDFs., no default value
  verbosity: -1, // default:`-1` - log level of pdf.js
  normalizeWhitespace: false, // default:`false` - replaces all occurrences of whitespace with standard spaces (0x20).
  disableCombineTextItems: false, // default:`false` - do not attempt to combine  same line {@link TextItem}'s.
};

const extractPDFInfo = async (buffer) => {
  const pdfExtract = new PDFExtract();
  const options = {}; /* see above PDFExtractOptions */

  const details = await pdfExtract
    .extractBuffer(buffer, options)
    .then((data) => {
      // console.log(`extractPDFInfo data for file ${filename}: `, data);
      return data;
    })
    .catch((error) => {
      console.log("Error on extractPDFInfo serice: ", error);
      // return {
      //   meta: `extractPDFInfo had errors for file ${filename}:
      //         ${err}`,
      // };
    });
  return details;
};
module.exports = { extractPDFInfo };
