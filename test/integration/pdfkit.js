const fs = require("fs");
const PDFDocument = require("pdfkit");

module.exports = () => {
  const doc = new PDFDocument();
  doc.fontSize(15).text("Hi there", 50, 50);
  doc.end();
};
