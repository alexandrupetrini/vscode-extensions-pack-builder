import * as vscode from "vscode";
import * as fs from "fs";
import * as prfs from "fs";
import * as path from "path";
import * as os from "os";
import { child_process } from "./child_process";
import { PackOptions } from "./commands";

export async function EnsureExtensionPackFactory(options: PackOptions) {
  const extensionDisplayName = options.packageName;
  const extensionTemplatePath = path.join(options.factoryFolder, options.packageId);

  if (!prfs.existsSync(options.factoryFolder)) {
    prfs.mkdirSync(options.factoryFolder);
  }

  // install extension generator
  if (!prfs.existsSync(path.join(options.factoryFolder, "node_modules"))) {
    await child_process.exec("npm i yo generator-code", { cwd: options.factoryFolder });
  }

  if (!prfs.existsSync(path.join(extensionTemplatePath, "README.md"))) {
    // generate extension
    let cmd = `node_modules${path.sep}.bin${path.sep}yo code --extensionName="${
      options.packageId
    }" --extensionDescription="Template to build extension packs" --extensionType=extensionpack --extensionDisplayName="${extensionDisplayName}" --extensionPublisher="${
      options.publisher
    }" --extensionParam="n"`;

    try {
      await child_process.exec(cmd, { cwd: options.factoryFolder });
    } catch (err) {
      vscode.window.showErrorMessage("Failed to generate the pack...", err);
      return false;
    }
  }

  // update readme
  let rd = fs.readFileSync(path.join(options.extensionPath, "out", "extension_readme.md"), "UTF-8");
  rd = rd
    .replace("#packageName#", options.packageName)
    .replace(
      "#extension-list#",
      options.extensions.map(ext => `${ext.label} (${ext.id})`).reduce((prev, cur, i) => (prev += `- ${cur}${os.EOL}`), "")
    );
  fs.writeFileSync(path.join(extensionTemplatePath, "README.md"), rd);

  // update package.json
  let pkJson = fs.readFileSync(path.join(options.extensionPath, "out", "extension_package.json"));
  fs.writeFileSync(path.join(extensionTemplatePath, "package.json"), pkJson);

  let file = prfs.readFileSync(path.join(options.extensionPath, "out", "extension_package.json"), "UTF-8");
  file = file
    .replace("#extension-name#", options.packageId)
    .replace("#extension-displayname#", options.packageName)
    .replace("#extension-publisher#", options.publisher)
    .replace("#extension-list#", `${options.extensions.map(ext => `"${ext.id}"`).join(",")}`);

  let packageJson = JSON.parse(file);
  packageJson.repository = extensionTemplatePath;
  // TODO enable later
  // packageJson.icon = path.join(context.extensionPath, "out", "pack_icon.png");

  fs.writeFileSync(path.join(extensionTemplatePath, "package.json"), JSON.stringify(packageJson), "UTF-8");

  if (!prfs.existsSync(path.join(extensionTemplatePath, "build"))) {
    prfs.mkdirSync(path.join(extensionTemplatePath, "build"));
  }

  return true;
}

export function PackageExtension(extensionPath: string, extensionName: string) {
  return child_process.exec(`npx vsce package -o build/${extensionName}.vsix`, { cwd: extensionPath });
}