import * as XLSX from "xlsx";

export interface SheetRenameResult {
  previousSheetName: string;
  outputSheetName: string;
}

export function getFirstSheetName(filePath: string): string {
  const workbook = XLSX.readFile(filePath);
  return workbook.SheetNames[0] || "";
}

/**
 * Renames the first sheet in an XLSX workbook to "Sheet1".
 * NIID rejects files where the sheet name is not "Sheet1".
 */
export function renameSheetToSheet1(
  inputPath: string,
  outputPath: string
): SheetRenameResult {
  const workbook = XLSX.readFile(inputPath);
  const firstSheetName = workbook.SheetNames[0];

  if (!firstSheetName) {
    throw new Error("Downloaded workbook has no worksheets");
  }

  const firstSheet = workbook.Sheets[firstSheetName];
  const normalizedWorkbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(normalizedWorkbook, firstSheet, "Sheet1");
  XLSX.writeFile(normalizedWorkbook, outputPath, {
    bookType: "xlsx",
    compression: true,
  });

  const writtenWorkbook = XLSX.readFile(outputPath);
  if (writtenWorkbook.SheetNames[0] !== "Sheet1" || !writtenWorkbook.Sheets.Sheet1) {
    throw new Error(
      `Failed to rename XLSX sheet to Sheet1. First sheet is ${writtenWorkbook.SheetNames[0] || "missing"}`,
    );
  }

  return {
    previousSheetName: firstSheetName,
    outputSheetName: "Sheet1",
  };
}
