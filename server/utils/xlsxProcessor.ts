import * as XLSX from "xlsx";

/**
 * Renames the first sheet in an XLSX workbook to "Sheet1".
 * NIID rejects files where the sheet name is not "Sheet1".
 */
export function renameSheetToSheet1(
  inputPath: string,
  outputPath: string
): void {
  const workbook = XLSX.readFile(inputPath);
  const firstSheetName = workbook.SheetNames[0];

  if (firstSheetName !== "Sheet1") {
    const sheet = workbook.Sheets[firstSheetName];
    delete workbook.Sheets[firstSheetName];
    workbook.SheetNames[0] = "Sheet1";
    workbook.Sheets["Sheet1"] = sheet;
  }

  XLSX.writeFile(workbook, outputPath);
}
