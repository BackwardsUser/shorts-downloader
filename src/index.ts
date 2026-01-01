import { Client, Events, GatewayIntentBits, Message, MessageReaction } from "discord.js";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { config } from "dotenv";
import { spawn } from "node:child_process";
import { v4 as uuidv4 } from "uuid";

// Initialize .env file
config();

/* Discord initiation */
const intents: GatewayIntentBits[] = [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent];
const client = new Client({ intents });

/* Path constants */
const bins = join(process.cwd(), "bin");
const conversions = join(process.cwd(), "data", "conversion.json")
const tmp = join(process.cwd(), "tmp");

type CmdType = {
  bin: string,
  args: string[]
}

/**
 * Gets the conversion bin from the conversion library
 * @param url The url to convert
 * @returns Process spawn information for required binary
 */
function FindMatchingURL(url: string): CmdType | null {
  const f = readFileSync(conversions).toString();
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
  const dir = readdirSync(tmp);
  const files = dir.filter(file => file.includes(id));
  if (!files) {
    fail(working, message);
    console.warn(`Got to final stages without downloading a file with the correct ID: ${id}`);
    return;
  }
  if (files.length > 1) {
    console.warn("there are multiple files with the same ID.");
    for (const file of files) {
      rmSync(join(tmp, file));
    }
    fail(working, message);
    return;
  }
  const file = join(tmp, files[0] as string);
  console.log(`File Size: ${statSync(file).size}`)
  if ((statSync(file).size / 1000000) >= 15) {
    fail(working, message);
    console.warn(`File too large to convert.`)
    return;
  }
  // This isn't possible, but whatever.
  if (message.channel.isSendable())
    await message.channel.send({ content: `Automatically converted url from ${message.author.username}`, files: [file] });
  if (message.deletable) {
    await message.delete();
  }
  if (existsSync(file))
    rmSync(file);
  return;
}

/* Bot Started Event */
client.on(Events.ClientReady, c => {
  console.log(`Successfully logged in as ${c.user.username}`);
  /* Check if the bins dir exists. */
  if (!existsSync(bins)) {
    console.error("There is no bin dir");
    client.destroy();
    process.exit();
  }

  /* Check for data dir */
  if (!existsSync(join(process.cwd(), "data"))) {
    console.warn("Missing data dir");
    client.destroy();
    process.exit();
  }

  /* Check if conversion.json exists. */
  if (!existsSync(conversions)) {
    console.warn("There is no conversions file. Running the bot without it is useless.");
    client.destroy();
    process.exit();
  }

  /* Compare existing binaries to used binaries in conversion.json */
  const cv = readFileSync(conversions).toString();
  const j = JSON.parse(cv);
  const v = Object.values(j);
  const b = v.map((vl: any) => vl.cmd.bin);

  const storedBins = readdirSync(bins);

  const missing = [];

  for (const bin of b) {
    const s = storedBins.filter(f => f.includes(bin));
    if (s.length == 0)
      missing.push(bin);
  }

  if (missing.length > 0) {
    console.error(`There are missing binary(s): *${missing.join("\n*")}`);
    client.destroy();
    process.exit();
  }

  /* Check for tmp file, create if doesn't exist. */
  if (!existsSync(join(process.cwd(), "tmp")))
    mkdirSync(join(process.cwd(), "tmp"));

  /* Note: files are created into tmp file, so it doesn't need to exist before running. */
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

/**
 * Fixes the url clutter that some websites add to URLs
 * @param url The url to clean
 * @returns The cleaned URL (or the original url if failed)
 */
function cleanUrl(url: string): string {
  try {
    const urlObj = new URL(url);

    // Remove all query parameters
    urlObj.search = '';

    // Remove hash/fragment
    urlObj.hash = '';

    // Clean the pathname (remove trailing slashes)
    urlObj.pathname = urlObj.pathname.replace(/\/+$/, '');

    return urlObj.toString();
  } catch (err: any) {
    console.error('Invalid URL:', err.message);
    return url; // Return original if parsing fails
  }
}

/* Bot Message Event */
client.on(Events.MessageCreate, async message => {
  /* Originally wrote this to use a command and prefix, this was easier than replacing all occurances */
  const args = message.content.split(" ");

  /* This checks every message to see if its a fitting URL */
  /* TODO: only check messages which are URLs */
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
      .replaceAll("(url)", cleanUrl(url))
  );

  const binPath = join(bins, bin);

  const outIndex = finalArgs.findIndex(a => a.includes("tmp/"));
  if (outIndex !== -1) {
    finalArgs[outIndex] = resolve(process.cwd(), finalArgs[outIndex] as string);
  }

  /* Create new process running media downloader binary */
  const child = spawn(binPath, finalArgs, {
    shell: false,
    windowsHide: true
  });

  /* Sub-Process event handling */
  child.stdout.on("data", d => console.log(d.toString()));
  child.stderr.on("data", d => console.error(d.toString()));

  child.on("close", code => {
    console.log(`yt-dlp exited with code ${code}`);
    if (code == 0) {
      handleSend(message, id, working);
    } else {
      fail(working, message);
    }
  });
});

// Bot Login
client.login(process.env.TOKEN);