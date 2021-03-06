import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { child_process } from "../node_async/child_process";
import { log } from "./log";
import { PackOptions } from "../models";
import { InstallVSIX } from "./installExtension";

export async function EnsureExtensionPackFactory(options: PackOptions) {
  const extensionDisplayName = options.packageName;
  const extensionTemplatePath = path.join(options.factoryFolder, options.packageId);

  if (!fs.existsSync(options.factoryFolder)) {
    fs.mkdirSync(options.factoryFolder);
  }

  // install extension generator
  if (!fs.existsSync(path.join(options.factoryFolder, "node_modules"))) {
    log.appendLine(`  - Installing generators...`);
    await child_process.exec("npm i yo https://github.com/mrluje/vscode-generator-code.git#fix", { cwd: options.factoryFolder });
  }

  if (!fs.existsSync(path.join(extensionTemplatePath, "README.md"))) {
    // generate extension
    let cmd = `node_modules${path.sep}.bin${path.sep}yo code --extensionName="${
      options.packageId
    }" --extensionDescription="Template to build extension packs" --extensionType=extensionpack --extensionDisplayName="${extensionDisplayName}" --extensionPublisher="${
      options.publisher
    }" --extensionParam="n"`;

    try {
      log.appendLine(`  - Generating the template...`);
      await child_process.exec(cmd, { cwd: options.factoryFolder });
    } catch (err) {
      vscode.window.showErrorMessage("Failed to generate the pack...", err);
      return false;
    }
  }

  log.appendLine(`  - Copying icon...`);
  fs.copyFileSync(path.join(options.extensionPath, "out", "pack_icon.png"), path.join(extensionTemplatePath, "pack_icon.png"));

  log.appendLine(`  - Updating readme.md...`);

  let rd = fs.readFileSync(path.join(options.extensionPath, "out", "extension_readme.md"), "UTF-8");
  rd = rd
    .replace("%packageName%", options.packageName)
    .replace(
      "%extension-list%",
      options.extensions.map(ext => `${ext.label} (${ext.id})`).reduce((prev, cur, i) => (prev += `- ${cur}${os.EOL}`), "")
    );
  fs.writeFileSync(path.join(extensionTemplatePath, "README.md"), rd);

  log.appendLine(`  - Updating package.json...`);

  let pkJson = fs.readFileSync(path.join(options.extensionPath, "out", "extension_package.json"), "UTF-8");
  pkJson = pkJson
    .replace("#extension-name#", options.packageId.replace(".", ""))
    .replace("#extension-displayname#", options.packageName)
    .replace("#extension-publisher#", options.publisher)
    .replace("#extension-list#", `${options.extensions.map(ext => `"${ext.id}"`).join(",")}`);

  let packageJson = JSON.parse(pkJson);
  packageJson.repository = extensionTemplatePath;
  packageJson.icon = "pack_icon.png";

  fs.writeFileSync(path.join(extensionTemplatePath, "package.json"), JSON.stringify(packageJson), "UTF-8");

  log.appendLine(`  - Preparing build folder...`);
  if (!fs.existsSync(path.join(extensionTemplatePath, "build"))) {
    fs.mkdirSync(path.join(extensionTemplatePath, "build"));
  }

  return true;
}

export function PackageExtension(extensionPath: string, extensionName: string) {
  return child_process.exec(`npx vsce package -o build/${extensionName}.vsix`, { cwd: extensionPath });
}

export function ProcessPackCreation(options: PackOptions) {
  vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: "Building extension pack... (first run may take a few minutes)",
      cancellable: true
    },
    async (progress, token) => {
      if (token.isCancellationRequested) {
        return;
      }
      log.appendLine(` Preparing extensions factory...`);
      let success = await EnsureExtensionPackFactory(options);
      if (!success || token.isCancellationRequested) {
        return;
      }

      log.appendLine(` Creating the extension...`);
      let packSuccess;
      try {
        packSuccess = await PackageExtension(path.join(options.factoryFolder, options.packageId), options.packageId);
      } catch (err) {
        vscode.window.showErrorMessage("Failed to generate the pack...\n" + err);
      }
      if (!packSuccess || token.isCancellationRequested) {
        return;
      }

      // set it as done so the progress window is done
      progress.report({ increment: 100 });
      log.appendLine(` Installing the extension...`);

      try {
        await InstallVSIX(vscode.Uri.file(path.join(options.factoryFolder, options.packageId, "build", `${options.packageId}.vsix`)));
      } catch (err) {
        vscode.window.showErrorMessage("Failed to install the pack...\n" + err);
      }
      log.appendLine(` Done`);
    }
  );
}
