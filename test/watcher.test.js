const path = require('path');
const ncc = global.coverage ? require("../src/index") : require("../");
const fs = require('fs');

// Based on the NodeWatchFileSystem class at:
// - https://github.com/webpack/webpack/blob/master/lib/node/NodeWatchFileSystem.js
// which in turn exposes:
// - https://www.npmjs.com/package/watchpack

class CustomWatchFileSystem {
  constructor(watchStart, watchEnd) {
    this.closed = false;
    // paused allows the watchers to stay open for the next build
    this.paused = false;
    this.changeCallback = undefined;
    this.changeCallbackUndelayed = undefined;
    this.watchStart = watchStart;
    this.watchEnd = watchEnd;

    // Webpack requires us to track this stuff
    this.files = undefined;
    this.dirs = undefined;
    this.missing = undefined;
    this.timestamps = new Map();
    this.changes = new Set();
    this.removals = new Set();

    // this will be populated for us by ncc
    this.inputFileSystem = undefined;
  }
  
  triggerChanges (changed, removed) {
    if (!this.paused) {
      const newTime = +Date.now();
      for (const file of changed)
        this.timestamps.set(file, {
          safeTime: newTime + 10,
          accuracy: 10,
          timestamp: newTime
        });
      for (const file of removed)
        this.timestamps.set(file, null);

      for (const file of changed) {
        this.changes.add(file);
        this.inputFileSystem.purge(file);
      }
      for (const file of removed) {
        this.removals.add(file);
        this.inputFileSystem.purge(file);
      }

      this.changeCallbackUndelayed(
        null,
        this.timestamps,
        this.timestamps,
        removed
      );
      this.changeCallback(
        null,
        this.timestamps,
        this.timestamps,
        removed
      );
    }
  }

  // This is called on every rebuild
  watch (files, dirs, missing, startTime, options, changeCallback, changeCallbackUndelayed) {
    this.files = new Set(files);
    this.dirs = new Set(dirs);
    this.missing = new Set(missing);

    // empty object indicates "unknown" timestamp
    // (that is, not cached)
    for (const item of files)
      this.timestamps.set(item, {});
    for (const item of dirs)
      this.timestamps.set(item, {});
    // null represents "no file"
    for (const item of missing)
      this.timestamps.set(item, null);

    this.paused = false;
    this.changeCallback = changeCallback;
    this.changeCallbackUndelayed = changeCallbackUndelayed;

    // ...Start watching files, dirs, missing
    setImmediate(() => {
      this.watchStart(files, dirs, missing);
    });
		
    return {
      close: () => {
        this.watchEnd();
      },
      pause: () => {
        this.paused = true;
      },
      getInfo: () => ({
        changes: this.changes,
        removals: this.removals,
        fileTimeInfoEntries: this.timestamps,
        contextTimeInfoEntries: this.timestamps,
      }),
    };
  }
}

jest.setTimeout(30000);

it('Should support custom watch API', async () => {
  let buildCnt = 0;
  const buildFile = path.resolve('./test/integration/twilio.js');
  const initialBuildFileContents = fs.readFileSync(buildFile).toString();

  await new Promise((resolve, reject) => {
    const watcher = new CustomWatchFileSystem(function watchStart (files, dirs, missing) {
      expect(files._set.size).toBeGreaterThan(100);
      if (buildCnt < 3) {
        setTimeout(() => {
          // NOTE: We actually have to make the change for the rebuild to happen!
          fs.writeFileSync(buildFile, fs.readFileSync(buildFile).toString() + '\n');
          watcher.triggerChanges([buildFile], []);
        }, 100);
      }
    }, function watchEnd () {
      resolve();
    });

    console.time('First Build');
    const { handler, rebuild, close } = ncc(buildFile, {
      assetBuilds: true,
      watch: watcher
    });
    
    handler(({ err, code, map, assets, permissions }) => {
      if (err) return reject(err);
      buildCnt++;
      if (buildCnt === 1) {
        console.timeEnd('First Build');
      }
      else {
        console.timeEnd('Watched Build');
      }
      if (buildCnt === 3) {
        close();
        fs.writeFileSync(buildFile, fs.readFileSync(buildFile).toString().slice(0, -2));
      }
    });
    rebuild(() => {
      console.time('Watched Build');
    });
  });

  fs.writeFileSync(buildFile, initialBuildFileContents);
});

