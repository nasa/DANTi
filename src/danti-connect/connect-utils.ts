/**
 * @author: Paolo Masci
 * @date: 2024.07.08
 * 
 * ## Notices
 * Copyright 2019 United States Government as represented by the Administrator 
 * of the National Aeronautics and Space Administration. All Rights Reserved.
 * 
 * ## Disclaimers
 * No Warranty: THE SUBJECT SOFTWARE IS PROVIDED "AS IS" WITHOUT ANY WARRANTY OF ANY KIND, 
 * EITHER EXPRESSED, IMPLIED, OR STATUTORY, INCLUDING, BUT NOT LIMITED TO, ANY WARRANTY 
 * THAT THE SUBJECT SOFTWARE WILL CONFORM TO SPECIFICATIONS, ANY IMPLIED WARRANTIES OF 
 * MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, OR FREEDOM FROM INFRINGEMENT, 
 * ANY WARRANTY THAT THE SUBJECT SOFTWARE WILL BE ERROR FREE, OR ANY WARRANTY THAT 
 * DOCUMENTATION, IF PROVIDED, WILL CONFORM TO THE SUBJECT SOFTWARE. THIS AGREEMENT DOES NOT, 
 * IN ANY MANNER, CONSTITUTE AN ENDORSEMENT BY GOVERNMENT AGENCY OR ANY PRIOR RECIPIENT 
 * OF ANY RESULTS, RESULTING DESIGNS, HARDWARE, SOFTWARE PRODUCTS OR ANY OTHER APPLICATIONS 
 * RESULTING FROM USE OF THE SUBJECT SOFTWARE.  FURTHER, GOVERNMENT AGENCY DISCLAIMS 
 * ALL WARRANTIES AND LIABILITIES REGARDING THIRD-PARTY SOFTWARE, IF PRESENT IN THE 
 * ORIGINAL SOFTWARE, AND DISTRIBUTES IT "AS IS."
 * 
 * Waiver and Indemnity:  RECIPIENT AGREES TO WAIVE ANY AND ALL CLAIMS AGAINST THE 
 * UNITED STATES GOVERNMENT, ITS CONTRACTORS AND SUBCONTRACTORS, AS WELL AS ANY PRIOR 
 * RECIPIENT.  IF RECIPIENT'S USE OF THE SUBJECT SOFTWARE RESULTS IN ANY LIABILITIES, 
 * DEMANDS, DAMAGES, EXPENSES OR LOSSES ARISING FROM SUCH USE, INCLUDING ANY DAMAGES 
 * FROM PRODUCTS BASED ON, OR RESULTING FROM, RECIPIENT'S USE OF THE SUBJECT SOFTWARE, 
 * RECIPIENT SHALL INDEMNIFY AND HOLD HARMLESS THE UNITED STATES GOVERNMENT, 
 * ITS CONTRACTORS AND SUBCONTRACTORS, AS WELL AS ANY PRIOR RECIPIENT, TO THE EXTENT 
 * PERMITTED BY LAW.  RECIPIENT'S SOLE REMEDY FOR ANY SUCH MATTER SHALL BE THE IMMEDIATE, 
 * UNILATERAL TERMINATION OF THIS AGREEMENT.
 */

import * as path from 'path';

/**
 * Utility function, expands the leading ~/ in fname with the home folder $HOME_DIR
 * and normalizes the path structure
 * This function should be used before invoking any nodeJS function from fs and path
 * because nodeJS does not understand ~/, it's a shell thing
 */
// eslint-disable-next-line @typescript-eslint/no-var-requires
export const HOME_DIR: string = require('os').homedir();
export function tildeExpansion(pathName: string): string {
    if (pathName) {
        if (pathName.startsWith("~/") || pathName === "~") {
            pathName = pathName.replace("~", HOME_DIR);
        }
        return path.normalize(pathName);
    }
    return pathName;
}
// utility function, returns todays' date and time in the following format: 20221129_133015
export function today (): string {
    const date: Date = new Date();
    return date.getFullYear() 
    + `${date.getMonth() < 10 ? `0${date.getMonth()}` : `0${date.getMonth()}`}` 
    + `${date.getDay() < 10 ? `0${date.getDay()}` : `0${date.getDay()}`}`
    + "_"
    + `${date.getHours() < 10 ? `0${date.getHours()}` : `0${date.getHours()}`}`
    + `${date.getMinutes() < 10 ? `0${date.getMinutes()}` : `0${date.getMinutes()}`}`
    + `${date.getSeconds() < 10 ? `0${date.getSeconds()}` : `0${date.getSeconds()}`}`;
}
