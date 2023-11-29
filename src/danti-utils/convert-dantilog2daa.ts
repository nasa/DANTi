import { dantiLog2DaaFile } from "./dantiLogUtils";

// utility function, prints information on how to use the converter
export function help (): string {
    return `Usage:
node convert-dantilog2daa <log-file>`;
}

// get args from command line
const args: string[] = process.argv?.slice(2);
console.log('args: ', args);
if (args?.length && args[0]) {
    dantiLog2DaaFile(args[0], { adjustTime: true });
} else {
    console.log(help());
}