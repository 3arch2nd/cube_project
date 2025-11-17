/**
 * main.js – 완전 통합 버전 (전개도 + 겹침 찾기 / cube + rect / point + edge)
 */

(function () {
    "use strict";

    // 전역 프로젝트 상태 객체 (안정성 강화)
    window.CubeProject = {};

    // ------------------------------------------------------
    // ENUMS (UI.js에서 접근 가능하도록 window.CubeProject에 등록)
    // ------------------------------------------------------
    const MAIN_MODE = {
        NET_BUILD: "netBuild",
        OVERLAP_FIND: "overlapFind"
    };
    window.CubeProject.MAIN_MODE = MAIN_MODE; 

    const NET_TYPE = { CUBE: "cube", RECT: "rect", BOTH: "both" };

    // 겹침 모드 – 입체 종류
    const SOLID_TYPE = { CUBE: "cube", RECT: "rect", BOTH: "both" };

    // 겹침 모드 – 유형(점/선/둘다)
    const OVERLAP_MODE = { POINT: "point", EDGE: "edge", BOTH: "both" };

    const RUN_MODE = { PRACTICE: "practice", REAL: "real" };

    // ------------------------------------------------------
    // 상태 변수
    // ------------------------------------------------------
    let mainMode = null;

    // 전개도
    let netType = NET_TYPE.CUBE;

    // 겹침 찾기
    let overlapSolid = SOLID_TYPE.CUBE;
    let overlapMode = OVERLAP_MODE.POINT;

    let runMode = RUN_MODE.PRACTICE;
    let problemCount = 10;

    let problems = [];
    let currentIndex = 0;
    let currentProblem = null;
    window.CubeProject.currentProblem = currentProblem; // UI.js에서 사용하기 위해 노출

    let netCanvas, threeCanvas;

    // ------------------------------------------------------
    document.addEventListener("DOMContentLoaded", init);

    function init() {
        netCanvas = document.getElementById("net-canvas");
        threeCanvas = document.getElementById("three-view");

        bindModeSelectPage();
        bindNetSetupPage();
        bindOverlapSetupPage();
        bindProblemButtons();
        bindQRPopup();

        // 초기 선택 버튼 selected 상태 지정
        document.querySelector("#net-type-group button[data-type='cube']").classList.add("selected");
        document.querySelector("#net-run-group button[data-run='practice']").classList.add("selected");
        document.querySelector("#ov-solid-group button[data-solid='cube']").classList.add("selected");
        document.querySelector("#ov-type-group button[data-type='point']").classList.add("selected");
        document.querySelector("#ov-run-group button[data-run='practice']").classList.add("selected");
        
        showPage("mode-select-page");
    }

    // ------------------------------------------------------
    // PAGE SWITCH
    // ------------------------------------------------------
    function showPage(pageId) {
        const pages = [
            "mode-select-page",
            "setup-net",
            "setup-overlap",
            "problem-page",
            "result-page"
        ];

        pages.forEach(id => document.getElementById(id).classList.add("hidden"));
        document.getElementById(pageId).classList.remove("hidden");
    }

    // ------------------------------------------------------
    // MODE SELECT PAGE
    // ------------------------------------------------------
    function bindModeSelectPage() {
        document.getElementById("btn-mode-net").addEventListener("click", () => {
            mainMode = MAIN_MODE.NET_BUILD;
            showPage("setup-net");
        });

        document.getElementById("btn-mode-overlap").addEventListener("click", () => {
            mainMode = MAIN_MODE.OVERLAP_FIND;
            showPage("setup-overlap");
        });
    }

    // ------------------------------------------------------
    // NET BUILD SETUP PAGE
    // ------------------------------------------------------
    function bindNetSetupPage() {

        document.querySelectorAll("#net-type-group button").forEach(btn => {
            btn.addEventListener("click", () => {
                document.querySelectorAll("#net-type-group button")
                    .forEach(b => b.classList.remove("selected"));
                btn.classList.add("selected");
                netType = btn.dataset.type;
            });
        });

        document.querySelectorAll("#net-run-group button").forEach(btn => {
            btn.addEventListener("click", () => {
                document.querySelectorAll("#net-run-group button")
                    .forEach(b => b.classList.remove("selected"));
                btn.classList.add("selected");
                runMode = btn.dataset.run;
            });
        });

        const disp = document.getElementById("net-q-display");
        document.getElementById("net-q-minus").addEventListener("click", () => {
            problemCount = Math.max(1, problemCount - 1);
            disp.textContent = problemCount;
        });
        document.getElementById("net-q-plus").addEventListener("click", () => {
            problemCount = Math.min(50, problemCount + 1);
            disp.textContent = problemCount;
        });

        document.getElementById("start-net").addEventListener("click", startNetProblems);
    }

    // ------------------------------------------------------
    // OVERLAP SETUP PAGE (new version)
    // ------------------------------------------------------
    function bindOverlapSetupPage() {

        // (1) 입체 종류
        document.querySelectorAll("#ov-solid-group button").forEach(btn => {
            btn.addEventListener("click", () => {
                document.querySelectorAll("#ov-solid-group button")
                    .forEach(b => b.classList.remove("selected"));
                btn.classList.add("selected");

                overlapSolid = btn.dataset.solid;
            });
        });

        // (2) 겹침 유형
        document.querySelectorAll("#ov-type-group button").forEach(btn => {
            btn.addEventListener("click", () => {
                document.querySelectorAll("#ov-type-group button")
                    .forEach(b => b.classList.remove("selected"));
                btn.classList.add("selected");

                overlapMode = btn.dataset.type;
            });
        });

        // run mode
        document.querySelectorAll("#ov-run-group button").forEach(btn => {
            btn.addEventListener("click", () => {
                document.querySelectorAll("#ov-run-group button")
                    .forEach(b => b.classList.remove("selected"));
                btn.classList.add("selected");
                runMode = btn.dataset.run;
            });
        });

        const disp = document.getElementById("ov-q-display");
        document.getElementById("ov-q-minus").addEventListener("click", () => {
            problemCount = Math.max(1, problemCount - 1);
            disp.textContent = problemCount;
        });
        document.getElementById("ov-q-plus").addEventListener("click", () => {
            problemCount = Math.min(50, problemCount + 1);
            disp.textContent = problemCount;
        });

        document.getElementById("start-overlap").addEventListener("click", startOverlapProblems);
    }

    // ------------------------------------------------------
    // PROBLEM GENERATION
    // ------------------------------------------------------

    /** 1) 전개도 문제 생성 */
    function generateOneNetProblem() {

        if (netType === NET_TYPE.CUBE) {
            const p = CubeNets.getRandomPieceProblem();
            return {
                mode: MAIN_MODE.NET_BUILD,
                solid: "cube",
                net: p.net,
                dims: null
            };
        }

        if (netType === NET_TYPE.RECT) {
            const r = RectPrismNets.getRandomRectNet();
            return {
                mode: MAIN_MODE.NET_BUILD,
                solid: "rect",
                net: r.net,
                dims: r.dims
            };
        }

        // BOTH
        if (Math.random() < 0.5) {
            const p = CubeNets.getRandomPieceProblem();
            return { mode:MAIN_MODE.NET_BUILD, solid:"cube", net:p.net, dims:null };
        } else {
            const r = RectPrismNets.getRandomRectNet();
            return { mode:MAIN_MODE.NET_BUILD, solid:"rect", net:r.net, dims:r.dims };
        }
    }

    /** 2) 겹침 문제 생성 */
    function generateOneOverlapProblem() {

        let netObj;

        // (1) 입체 선택
        if (overlapSolid === SOLID_TYPE.CUBE) {
