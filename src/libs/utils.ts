export function parseSemicolorToArray(input: string[]): string[];
export function parseSemicolorToArray(input?: string[]): undefined | string[] {
  if (!input) {
    return undefined;
  }

  return input.reduce<string[]>(
    (acc, line) =>
      acc
        .concat(line.split(','))
        .filter((x) => x !== '')
        .map((x) => x.trim()),
    [],
  );
}

export function stripAnsiControlCodes(text: string): string {
  const regex_ansi = RegExp(`\x1B(?:[@-Z\\-_]|[[0-?]*[ -/]*[@-~])`, 'g');
  return text.replace(regex_ansi, '');
}

export function extractViewLiveLink(output: string): string {
  /**
   *  Extracts the Pulumi preview link from the output
   *  output: pulumi preview output
   *
   *  return link to the Pulumi preview
   */
  const lines = output.split('\n');
  const linkLine = lines.find((line) => line.includes('View Live:'));
  if (!linkLine) {
    return '';
  }
  return linkLine.split('View Live: ')[1];
}
