import inquirer from "inquirer";

export async function handleInteractiveInput(paramName: string): Promise<string | null> {
  const { INTERACTIVE_MODE } = process.env;
  if (!INTERACTIVE_MODE || INTERACTIVE_MODE === "false") return null;

  const inputs = await inquirer.prompt([{ name: paramName, message: `Please provide ${paramName} > ` }]);
  const input = inputs[paramName];
  return input;
}

export async function confirmInput(action?: string) {
  const { INTERACTIVE_MODE } = process.env;
  if (!INTERACTIVE_MODE || INTERACTIVE_MODE === "false") return true;

  const inputs = await inquirer.prompt([{ name: "confirmation", message: `Please confirm ${action ? action : ""} (y/n):` }]);
  const input = inputs["confirmation"];
  if (!(input == "y" || input == "Y")) process.exit();
}
