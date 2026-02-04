/* Initialize .env */
import { config } from "dotenv";
config();

/* Initialize Packages */
import { Client, DMChannel, Message, MessageReaction } from "djs-selfbot-v13";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { v4 as uuidv4 } from "uuid";
import { join, resolve } from "node:path";
import { spawn } from "node:child_process";
import { ChannelTypes } from "djs-selfbot-v13/typings/enums";

const client = new Client();

/* Path Constants */
const binsPath = join(process.cwd(), "bin");
const dataPath = join(process.cwd(), "data");
const conversionsPath = join(dataPath, "conversion.json");
const tmpPath = join(process.cwd(), "tmp");

type CmdType = {
  bin: string,
  args: string[]
}

/* Helper Functions */
/**
 * Gets the conversion bin from the conversion library
 * @param url The url to convert
 * @returns Process spawn information for required binary
 */
function FindMatchingURL(url: string): CmdType | null {
  const f = readFileSync(conversionsPath).toString();
  const j = JSON.parse(f);
  const d = Object.entries(j);
  for (const service of d) {
    const data: any = service[1];
    for (const string of data.strings) {
      const r = new RegExp(string);
      const m = r.exec(url);
      if (m) {
        return data.cmd;
      }
    }
  }
  return null;
}

/**
 * Handles sending the final file
 * @param message The original user message
 * @param id The ID of the file
 * @param working The "working" reaction sent on the original message.
 */
async function handleSend(message: Message, id: string, working: any): Promise<void> {
  const dir = readdirSync(tmpPath);
  const files = dir.filter(file => file.includes(id));
  if (!files) {
    fail(working, message);
    console.warn(`Got to final stages without downloading a file with the correct ID: ${id}`);
    return;
  }
  if (files.length > 1) {
    console.warn("there are multiple files with the same ID.");
    for (const file of files) {
      rmSync(join(tmpPath, file));
    }
    fail(working, message);
    return;
  }
  const file = join(tmpPath, files[0] as string);
  console.log(`File Size: ${statSync(file).size}`)
  console.log((statSync(file).size / 1000000))
  if ((statSync(file).size / 1000000) >= 10) {
    oversize(working, message);
    console.warn(`File too large to convert.`)
    return;
  }

  try {
    console.log(`Converted URL for server ${message.guild?.name}`)
    await message.channel.send({ content: `Automatically converted url from ${message.author.username}`, files: [file] });
  } catch (err) {
    console.warn(`Failed to convert URL for server ${message.guild?.name} - URL: ${message.content}`)
    console.warn("Discord Error: " + err);
    fail(working, message);
    return;
  }

  if (message.deletable) {
    await message.delete();
  }
  if (existsSync(file))
    rmSync(file);
  return;
}

client.on("ready", c => {
  console.log(`Successfully logged in as ${c.user.username}`);

  if (!existsSync(binsPath)) {
    console.error("There is no bin directory");
    client.destroy();
    process.exit();
  }

  if (!existsSync(dataPath) || !existsSync(conversionsPath)) {
    console.warn("There is no conversions file. Running the bot without it is useless")
    client.destroy();
    process.exit();
  }

  const conversionsRaw = readFileSync(conversionsPath).toString()
  const conversionsJson = JSON.parse(conversionsRaw);
  const conversionValues = Object.values(conversionsJson);
  const requiredBins = conversionValues.map((conValue: any) => conValue.cmd.bin)

  const storedBins = readdirSync(binsPath);

  const missing = [];

  for (const bin of requiredBins) {
    const foundBin = storedBins.filter(f => f.includes(bin));
    if (storedBins.length == 0)
      missing.push(bin);
  }

  if (missing.length > 0) {
    console.error(`There are missing binary(s): *${missing.join("\n*")}`);
    client.destroy();
    process.exit();
  }

  if (!existsSync(join(process.cwd(), "tmp")))
    mkdirSync(join(process.cwd(), "tmp"));
});

/**
 * Simple fail helper function
 * This function just removes the gear reaction and replaces it with a cross indicating the conversion failed for one reason or another
 * @param working The "working" gear reaction
 * @param message The message to update reactions
 */
function fail(working: MessageReaction, message: Message) {
  working.remove();
  message.react('❌')
}

function oversize(working: MessageReaction, message: Message) {
  working.remove();
  message.react('🐦‍⬛')
}

client.on("messageCreate", async message => {

  if (message.channel.type !== "DM" && message.channel.type !== "GROUP_DM")
    return;

  const args = message.content.split(" ");

  if (!FindMatchingURL(args[0] as string))
    return;

  const working = await message.react('⚙️');

  if (args.length == 0) {
    fail(working, message);
    return;
  }

  console.log(`Attempting convert of ${args}`);

  const cmd = FindMatchingURL(args[0] as string);
  if (!cmd) {
    fail(working, message);
    return;
  }

  const id = uuidv4();
  const url = args[0] as string;

  const { bin, args: rawArgs } = cmd;
  const finalArgs = rawArgs.map(arg =>
    arg
      .replaceAll("(id)", id)
      .replaceAll("(url)", url.toString())
  );

  const binPath = join(binsPath, bin);

  const outIndex = finalArgs.findIndex(a => a.includes("tmp/"));
  if (outIndex !== -1) {
    finalArgs[outIndex] = resolve(process.cwd(), finalArgs[outIndex] as string);
  }

  const child = spawn(binPath, finalArgs, {
    shell: false,
    windowsHide: true
  });

  child.stdout.on("data", d => console.log(d.toString()));
  child.stderr.on("data", d => console.error(d.toString()));

  child.on("close", code => {
    console.log(`${bin} exited with code ${code}`);
    if (code == 0) {
      handleSend(message, id, working);
    } else {
      fail(working, message);
    }
  })
})

client.login(process.env.TOKEN);