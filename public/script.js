/* ===== BTEB Result Search — script.js ===== */
(function () {

  /* ---------- 1) HTML elements ---------- */
  var form      = document.getElementById("resultForm");
  var examEl    = document.getElementById("exam");
  var rollEl    = document.getElementById("roll");
  var captchaEl = document.getElementById("captcha");
  var questionEl= document.getElementById("captchaQuestion");
  var submitBtn = document.getElementById("submitBtn");
  var box       = document.getElementById("resultBox");
  var answer    = 0;

  /* ---------- 2) Data chunk loading ---------- */
  var chunkCache = {};
  var byRollCache= {};

  function getChunkFile(roll) {
    if (!roll || roll.length < 2) return null;
    return 'data_' + roll.slice(0, 2) + '.json';
  }

  function loadChunk(roll) {
    var file = getChunkFile(roll);
    if (!file) return Promise.reject(new Error("invalid_roll"));
    if (chunkCache[file]) return Promise.resolve(chunkCache[file]);
    return fetch(file)
      .then(function(res) {
        if (!res.ok) throw new Error("db_load_failed");
        return res.json();
      })
      .then(function(data) {
        chunkCache[file] = data;
        var map = new Map();
        for (var i = 0; i < data.records.length; i++) {
          var r = data.records[i];
          if (!map.has(r.roll)) map.set(r.roll, []);
          map.get(r.roll).push(r);
        }
        byRollCache[file] = map;
        return data;
      });
  }

  /* ---------- 3) Captcha ---------- */
  function newCaptcha() {
    var a = Math.floor(Math.random() * 9) + 1;
    var b = Math.floor(Math.random() * 9) + 1;
    answer = a + b;
    questionEl.textContent = a + " + " + b + " = ?";
    captchaEl.value = "";
  }
  newCaptcha();
  document.getElementById("captchaRefresh").addEventListener("click", newCaptcha);

  /* ---------- 4) Validation ---------- */
  function setError(id, msg) {
    var p = document.getElementById(id + "Error");
    p.textContent = msg;
    p.closest(".field").classList.toggle("invalid", !!msg);
  }
  function validate() {
    var roll = rollEl.value.trim();
    var cap  = captchaEl.value.trim();
    var eMsg = examEl.value ? "" : "Select your exam.";
    var rMsg = !roll ? "Enter your roll number." : (/^\d+$/.test(roll) ? "" : "Roll number must be digits only.");
    var cMsg = !cap  ? "Answer the question."   : (parseInt(cap,10) === answer ? "" : "Wrong answer.");
    setError("exam", eMsg); setError("roll", rMsg); setError("captcha", cMsg);
    if (cMsg && cap) newCaptcha();
    return !(eMsg || rMsg || cMsg);
  }

  /* ---------- 5) Grade from GPA ---------- */
  function getGrade(gpa) {
    if (gpa === null || gpa === undefined) return '-';
    if (gpa >= 4.00) return 'A+';
    if (gpa >= 3.75) return 'A';
    if (gpa >= 3.50) return 'A-';
    if (gpa >= 3.25) return 'B+';
    if (gpa >= 2.75) return 'B';
    if (gpa >= 2.50) return 'C+';
    if (gpa >= 2.25) return 'C';
    if (gpa >= 2.00) return 'D';
    return 'F';
  }

  function semLabel(n) {
    var s = ['','1st','2nd','3rd','4th','5th','6th','7th','8th'];
    return (s[n] || n + 'th') + ' Semester';
  }

  /* ---------- 6) Search ---------- */
  function getResult(exam, roll) {
    return loadChunk(roll).then(function(db) {
      var file = getChunkFile(roll);
      var map  = byRollCache[file];
      var records = (map.get(roll) || []).filter(function(r) {
        return exam === "" || exam === "Any" || r.exam === exam;
      });
      if (!records.length) { var e = new Error("not_found"); e.code = 404; throw e; }

      // Exam onujayi group, tarpor sob semester
      var groups = new Map();
      for (var i = 0; i < records.length; i++) {
        var r = records[i];
        if (!groups.has(r.exam)) {
          groups.set(r.exam, {
            exam: r.exam, instCode: r.inst,
            institute: db.institutes[r.inst] || r.inst,
            regulation: r.regulation, semesters: []
          });
        }
        groups.get(r.exam).semesters.push(r);
      }

      var out = [];
      groups.forEach(function(g) {
        g.semesters.sort(function(a,b){ return b.semester - a.semester; });
        out.push(g);
      });
      return { source: db.source, roll: roll, groups: out };
    });
  }

  /* ---------- 7) Render result ---------- */
  function el(tag, text, cls) {
    var e = document.createElement(tag);
    if (text !== undefined) e.textContent = text;
    if (cls) e.className = cls;
    return e;
  }

  function renderResult(data) {
    box.hidden = false;
    box.innerHTML = '';

    data.groups.forEach(function(g) {
      /* --- Card header --- */
      var card = document.createElement('div');
      card.className = 'res-card';

      var hdr = document.createElement('div');
      hdr.className = 'res-header';
      var rollH = el('h2', 'Roll: ' + data.roll);
      var examP = el('p', g.exam + ' — Reg. ' + g.regulation);
      var instP = el('p', g.institute || g.instCode);
      hdr.appendChild(rollH);
      hdr.appendChild(examP);
      hdr.appendChild(instP);
      card.appendChild(hdr);

      /* --- Semester rows --- */
      g.semesters.forEach(function(r) {
        var row = document.createElement('div');
        row.className = 'sem-row ' + (r.gpa !== null ? 'passed' : 'referred');

        /* Top: semester name + badge */
        var top = document.createElement('div');
        top.className = 'sem-top';
        top.appendChild(el('span', semLabel(r.semester), 'sem-name'));
        top.appendChild(el('span', r.gpa !== null ? '\u2713 Passed' : '\u2717 Referred', 'sem-badge'));
        row.appendChild(top);

        /* GPA block */
        var gpaBlock = document.createElement('div');
        gpaBlock.className = 'gpa-block';
        gpaBlock.appendChild(el('span', 'GPA', 'gpa-lbl'));
        gpaBlock.appendChild(el('span', r.gpa !== null ? r.gpa.toFixed(2) : '-', 'gpa-val'));
        gpaBlock.appendChild(el('span', getGrade(r.gpa), 'gpa-grade'));
        row.appendChild(gpaBlock);

        /* Failed subjects */
        if (r.failed && r.failed.length) {
          var fl = document.createElement('div');
          fl.className = 'failed-list';
          fl.appendChild(el('span', 'Referred subjects: ', 'fl-label'));
          fl.appendChild(el('span', r.failed.join(', ')));
          row.appendChild(fl);
        }

        card.appendChild(row);
      });

      /* Source note */
      card.appendChild(el('p', 'Source: ' + data.source + '. Subject to final approval of BTEB.', 'res-note'));
      box.appendChild(card);
    });
  }

  function showMsg(text, info) {
    box.hidden = false;
    box.innerHTML = '';
    var p = el('p', text, 'msg' + (info ? ' info' : ''));
    box.appendChild(p);
  }

  /* ---------- 8) Submit ---------- */
  form.addEventListener("submit", function(e) {
    e.preventDefault();
    if (!validate()) return;
    submitBtn.disabled = true;
    submitBtn.textContent = "Searching...";
    var file = getChunkFile(rollEl.value.trim());
    showMsg(file && !chunkCache[file] ? "⏳ Data load hocche..." : "🔍 Result khujchi...", true);

    getResult(examEl.value, rollEl.value.trim())
      .then(renderResult)
      .catch(function(err) {
        if (err.code === 404) showMsg("Ei roll ar exam diye kono result paoa jai ni. Roll number abar check korun.");
        else showMsg("Data load korte somoshya hoyeche. Internet connection check korun ar page refresh korun.");
      })
      .then(function() {
        submitBtn.disabled = false;
        submitBtn.textContent = "Search result";
        newCaptcha();
      });
  });

  /* ---------- 9) Clear ---------- */
  form.addEventListener("reset", function() {
    setTimeout(function() {
      ["exam","roll","captcha"].forEach(function(id){ setError(id,""); });
      box.hidden = true;
      newCaptcha();
    }, 0);
  });

})();
