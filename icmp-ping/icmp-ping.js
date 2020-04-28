/**
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 **/

module.exports = function (RED) {
  "use strict";
  let spawn = require("child_process").spawn;
  let plat = require("os").platform();

  // Define node status
  let statusProgress = {
    fill: "blue",
    shape: "dot",
    text: "in progress",
  };
  let statusFailed = {
    fill: "red",
    shape: "dot",
    text: "failed",
  };
  let statusOk = {
    fill: "green",
    shape: "dot",
    text: "ok",
  };
  let statusError = {
    fill: "red",
    shape: "ring",
    text: "error",
  };

  function PingNode(n) {
    RED.nodes.createNode(this, n);
    this.host = n.host;
    this.timeout = parseInt(n.timeout);
    this.requests = parseInt(n.requests);
    let node = this;

    node.on("input", function (msg, send, done) {
      send =
        send ||
        function () {
          node.send.apply(node, arguments);
        };

      node.status(statusProgress);
      let host = msg.host || node.host;

      if (msg.hasOwnProperty("payload")) {
        msg._payload = msg.payload;
      }
      if (msg.hasOwnProperty("topic")) {
        msg._topic = msg.topic;
      }

      msg.payload = false;
      msg.topic = host;

      // stop execution if host is not provided
      if (!host) {
        node.warn(
          "No host is specificed. Either specify in node configuration or by passing in msg.host"
        );
        node.status(statusError);
        return;
      }

      // execute ping command on detected platform
      let ex;
      if (plat == "linux") {
        ex = spawn("ping", [
          "-n",
          "-w",
          node.timeout,
          "-c",
          node.requests,
          host,
        ]);
      } else if (plat.match(/^win/)) {
        ex = spawn(
          "ping",
          ["-n", node.requests, "-w", node.timeout * 1000, host],
          { windowsHide: true }
        );
      } else if (plat == "darwin") {
        ex = spawn("ping", [
          "-n",
          "-t",
          node.timeout,
          "-c",
          node.requests,
          host,
        ]);
      } else {
				node.error("Sorry - your platform - " + plat + " - is not recognised.");
				return;
      }

      let line = "";
      let stats = {
        sent: 0,
        success: 0,
        failed: 0,
        mean: 0,
        ratio: 0,
      };

      // regex to parse result of the command and extract rtt
      let regex = /[Ff]rom.*time[<|=](\d*\.*\d*)\s*ms|[Ff]rom.*|timed/g;

      // accumulate data into string line
      ex.stdout.on("data", function (data) {
        line += data.toString();
      });

      // log execution error
      ex.stderr.on("data", function (data) {
        console.log("[ping] stderr: " + data);
      });

      // process command result
      ex.on("exit", function (code) {
        // node.warn(line);

        let m = [...line.matchAll(regex)];
        // node.warn(m);
        stats.sent = m.length;

        // extract rtt
        let rtt = [];
        m.forEach((result) => {
          rtt.push(parseFloat(result[1]));
        });
        console.log("[ping] rtt: " + rtt);

        // add ping stats
        let sum = 0;
        rtt.forEach((value) => {
          if (isNaN(value)) {
            stats.failed++;
            node.status(statusFailed);
          } else {
            stats.success++;
            sum = sum + value;
            node.status(statusOk);
          }
        });

        // calculate rtt mean and success ratio
        stats.mean = +(sum / stats.success).toFixed(1);
        stats.ratio = +(stats.success / stats.sent).toFixed(1);

				console.log("[ping] exit code: " + code);
        if (code === 0) {
					msg.payload = stats;
					node.send(msg);
        }
        if (done) {
					done();
        }
      });
    });
  }
  RED.nodes.registerType("icmp ping", PingNode);
};
