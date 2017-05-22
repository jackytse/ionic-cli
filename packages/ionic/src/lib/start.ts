import * as path from 'path';
import * as zlib from 'zlib';

import * as tar from 'tar';
import * as chalk from 'chalk';

import {
  ERROR_FILE_INVALID_JSON,
  ERROR_FILE_NOT_FOUND,
  createRequest,
  fsReadDir,
  fsReadJsonFile,
  fsUnlink,
  fsWriteJsonFile,
  load as loadFromUtils,
} from '@ionic/cli-utils';

import { StarterTemplate, StarterTemplateType } from '../definitions';

export function tarXvfFromUrl(url: string, destination: string, { progress }: {  progress?: (loaded: number, total: number) => void }) {
  return new Promise<void>((resolve, reject) => {
    const archiveRequest = createRequest('get', url)
      .timeout(900000) // 15 minutes
      .on('response', (res) => {
        if (res.statusCode !== 200) {
          reject(new Error(`Encountered bad status code (${res.statusCode}) for ${url}\n` +
                           `This could mean the server is experiencing difficulties right now--please try again later.\n\n` +
                           `If you're behind a firewall, you can proxy requests by using the HTTP_PROXY or IONIC_HTTP_PROXY environment variables.`));
        }

        if (progress) {
          let loaded = 0;
          const total = Number(res.headers['content-length']);
          res.on('data', (chunk) => {
            loaded += chunk.length;
            progress(loaded, total);
          });
        }
      })
      .on('error', (err) => {
        if (err.code === 'ECONNABORTED') {
          reject(new Error(`Timeout of ${err.timeout}ms reached for ${url}`));
        } else {
          reject(err);
        }
      });

    tarXvf(archiveRequest, destination).then(resolve, reject);
  });
}

/**
 *
 */
export function tarXvf(readStream: NodeJS.ReadableStream, destination: string) {
  return new Promise<void>((resolve, reject) => {
    const baseArchiveExtract = tar.Extract({
        path: destination,
        strip: 1
      })
      .on('error', reject)
      .on('end', resolve);
    try {
      readStream
        .on('error', reject)
        .pipe(zlib.createUnzip())
        .pipe(baseArchiveExtract);
    } catch (e) {
      reject(e);
    }
  });
}

/**
 *
 */
export function isProjectNameValid(name: string): boolean {
  return name !== '.';
}

/**
 * If project only contains files generated by GH, it’s safe.
 * We also special case IJ-based products .idea because it integrates with CRA:
 * https://github.com/facebookincubator/create-react-app/pull/368#issuecomment-243446094
 */
export async function isSafeToCreateProjectIn(root: string): Promise<boolean> {
  const validFiles = [
    '.DS_Store', 'Thumbs.db', '.git', '.gitignore', '.idea', 'README.md', 'LICENSE'
  ];

  const entries = await fsReadDir(root);

  return entries.every((file) => {
    return validFiles.indexOf(file) >= 0;
  });
}

/**
 *
 */
export function getStarterTemplateText(templateList: StarterTemplate[]): string {
  let headerLine = chalk.bold(`Ionic Starter templates`);
  let formattedTemplateList = getStarterTemplateTextList(templateList);


  return `
    ${headerLine}
      ${formattedTemplateList.join(`
      `)}
  `;
}

export function getStarterTemplateTextList(templateList: StarterTemplate[]): string[] {

  return templateList.map(({ name, type, description }) => {
    let templateName = chalk.green(name);

    return `${templateName} ${Array(20 - name.length).join(chalk.dim('.'))} ${chalk.bold(type)} ${description}`;
  });
}

/**
 *
 */
export function getHelloText(): string {
  return `
${chalk.bold('♬ ♫ ♬ ♫  Your Ionic app is ready to go! ♬ ♫ ♬ ♫')}

${chalk.bold('Run your app in the browser (great for initial development):')}
  ${chalk.green('ionic serve')}

${chalk.bold('Run on a device or simulator:')}
  ${chalk.green('ionic cordova run ios')}

${chalk.bold('Test and share your app on a device with the Ionic View app:')}
  http://view.ionic.io
  `;
}

export async function patchPackageJsonForCli(appName: string, starterType: StarterTemplateType, pathToProject: string): Promise<void> {
  const patchPackagePath = path.resolve(pathToProject, 'patch.package.json');
  const packagePath = path.resolve(pathToProject, 'package.json');

  let pkg;
  let patch;

  try {
    pkg = await fsReadJsonFile(packagePath);
  } catch (e) {
    if (e === ERROR_FILE_NOT_FOUND) {
      throw new Error(`${packagePath} is not valid JSON.`);
    } else if (e === ERROR_FILE_INVALID_JSON) {
      throw new Error(`${packagePath} is not valid JSON.`);
    }
    throw e;
  }

  try {
    patch = await fsReadJsonFile(patchPackagePath);

    const lodash = loadFromUtils('lodash');
    let finalPackage = lodash.merge(pkg, patch);

    await fsWriteJsonFile(packagePath, finalPackage, { encoding: 'utf8' });
    fsUnlink(patchPackagePath); // no await

  } catch (e) {
    if (e === ERROR_FILE_NOT_FOUND) {
      // no need to do anything
    } else if (e === ERROR_FILE_INVALID_JSON) {
      throw new Error(`${patchPackagePath} is not valid JSON.`);
    } else {
      throw e;
    }
  }
}

export async function updatePackageJsonForCli(appName: string, starterType: StarterTemplateType, pathToProject: string): Promise<void> {
  const filePath = path.resolve(pathToProject, 'package.json');
  try {
    let jsonStructure = await fsReadJsonFile(filePath);

    jsonStructure['name'] = appName;
    jsonStructure['version'] = '0.0.1';
    jsonStructure['description'] = 'An Ionic project';

    await fsWriteJsonFile(filePath, jsonStructure, { encoding: 'utf8' });

  } catch (e) {
    if (e === ERROR_FILE_NOT_FOUND) {
      throw new Error(`${filePath} not found`);
    } else if (e === ERROR_FILE_INVALID_JSON) {
      throw new Error(`${filePath} is not valid JSON.`);
    }
    throw e;
  }
}

export async function createProjectConfig(appName: string, starterType: StarterTemplateType, pathToProject: string, cloudAppId: string): Promise<void> {
  const filePath = path.resolve(pathToProject, 'ionic.config.json');
  const jsonStructure = {
    name: appName,
    app_id: cloudAppId,
    type: starterType.id
  };

  await fsWriteJsonFile(filePath, jsonStructure, { encoding: 'utf8' });
}
