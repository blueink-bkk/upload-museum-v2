#! /usr/bin/env node

/*

    THE ORIGINAL WAS IN
    /home/dkz/dev-utpp/museum-1808-massive-upload/upload-batch-85.js

    ATTENTION THIS IS ONLY FOR MUSEUM-V2
*/


const fs = require('fs');
const path = require('path');
const assert = require('assert');
const jsonfile = require('jsonfile')

const Massive = require('massive');
const monitor = require('pg-monitor');
var pdfjsLib = require('pdfjs-dist');

const argv = require('yargs')
  .alias('p','password')
  .alias('f','file')
  .alias('d','dir')
  .alias('a','all')
  .alias('v','verbose')
//  .alias('u','upload')
  .options({
    'commit': {default:true},
  }).argv;

const password = argv.password || process.env.PGPASSWORD;
const host = argv.host || process.env.PGHOST || 'inhelium.com';
const port = argv.port || process.env.PGPORT || '5432';
const database = argv.database || process.env.PGDATABASE || 'museum-v2';
const user = argv.user || process.env.PGUSER || 'postgres';

argv.dir = argv.dir || process.env.pdfdir;

if (!argv.file && !argv.dir) {
  console.log(`Need folder or pdf/file, ex:
    ./upload-museum-v2.js -d /media/dkz/Seagate/18.11-Museum-rsync-inhelium/pdf-www
    =>exit.`);
  return;
}


if (argv.file) {
  if (argv.dir) {
    console.log('Warning: Both dir and file are specified');
  }
  const fp = path.join(argv.dir, argv.file)
  if (!fs.existsSync(fp)) {
    console.log(`Directory <${fp}> not found`);
    return;
  }
  console.log(`processing file <${fp}>...`);
  every_pdf(fp, argv);
  return;
}

// ==========================================================================

/*
  Here we process an entire folder.
*/


function *walkSync(dir,patterns) {
  const files = fs.readdirSync(dir, 'utf8');
//  console.log(`scanning-dir: <${dir}>`)
  for (const file of files) {
    try {
      const pathToFile = path.join(dir, file);
      if (file.startsWith('.')) continue; // should be an option to --exclude
        const fstat = fs.statSync(pathToFile);
      const isSymbolicLink = fs.statSync(pathToFile).isSymbolicLink();
      if (isSymbolicLink) continue;

      const isDirectory = fs.statSync(pathToFile).isDirectory();
      if (isDirectory) {
        if (file.startsWith('.')) continue;
          yield *walkSync(pathToFile, patterns);
      } else {
        if (file.startsWith('.')) continue;
        let failed = false;
        for (pat of patterns) {
          const regex = new RegExp(pat,'gi');
          if (file.match(regex)) continue;
          failed = true;
          break;
        };
        if (!failed)
        yield pathToFile;
      }
    }
    catch(err) {
      console.log(`ALERT on file:${ path.join(dir, file)} err:`,err)
//      console.log(`ALERT err:`,err)
      continue;
    }
  }
}


const root_folder = argv.dir;
let nfiles =0;

async function main() {
  const db = await Massive({
    host,
    port,
    database,
    user,
    password
  });
  console.log('Massive is ready.');

  for (const fn of walkSync(root_folder, ['\.pdf$'])) {
    const doc = await pdfjsLib.getDocument(fn)
    const baseName = path.basename(fn);
    console.log(`[${nfiles++}] npages:${doc.numPages} <${fn}> `);
    for (let pageNo=1; pageNo <=doc.numPages; pageNo++) {
      const page = await doc.getPage(pageNo);
      const textContent = await page.getTextContent();
      const raw_text = textContent.items
        .map(it => it.str).join(' ')
        .replace(/\s+/g,' ')
        .replace(/\.\.+/g,'.');

      if (argv.commit) {
        try {
//          console.log(`-- page ${pageNo} raw_text:${raw_text.length}`);
          const retv = await db.pdf_write_page(baseName, pageNo, raw_text, undefined);
          console.log(`-- page ${pageNo} raw_text:${raw_text.length} retv:`,retv.pdf_write_page)
        }
        catch(err) {
          console.log(err)
        }
      }

    }; // each page
  }; // each pdf
  return nfiles;
};




main(argv)
.then((npages)=>{
  console.log('done npages:',npages);
})
.catch (err => {
  throw err
})

function _assert(b, o, err_message) {
  if (!b) {
    console.log(`[${err_message}]_ASSERT=>`,o);
    console.trace(`[${err_message}]_ASSERT`);
    throw {
      message: err_message // {message} to be compatible with other exceptions.
    }
  }
}
