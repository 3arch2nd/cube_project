/**
 * main.js – 완전 통합 버전 (정육면체 전용)
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

    // 정육면체 전용이므로 CUBE만 사용
    const OVERLAP_MODE = { POINT: "point", EDGE: "edge", BOTH: "both" };

    const RUN_MODE = { PRACTICE: "practice", REAL: "real" };

    // ------------------------------------------------------
    // 상태 변수
    // ------------------------------------------------------
    let mainMode = null;
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

        // 초기 선택 버튼 selected 상태 지정 (정육면체만 남기므로)
        document.querySelector("#net-run-group button[data-run='practice']").classList.add("selected");
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
        // 직육면체 관련 설정 페이지 대신 바로 문제 설정으로 이동
        document.getElementById("btn-mode-net").addEventListener("click", () => {
            mainMode = MAIN_MODE.NET_BUILD;
            showPage("setup-net"); // 기존 전개도 완성하기 설정 페이지 재사용
        });

        document.getElementById("btn-mode-overlap").addEventListener("click", () => {
            mainMode = MAIN_MODE.OVERLAP_FIND;
            showPage("setup-overlap"); // 기존 겹침 찾기 설정 페이지 재사용
        });
    }

    // ------------------------------------------------------
    // NET BUILD SETUP PAGE (정육면체 전용으로 변경)
    // ------------------------------------------------------
    function bindNetSetupPage() {

        // ⭐ 입체 종류 선택 그룹 제거 (정육면체 고정)

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
    // OVERLAP SETUP PAGE (정육면체 전용으로 변경)
    // ------------------------------------------------------
    function bindOverlapSetupPage() {

        // ⭐ 입체 종류 선택 그룹 제거 (정육면체 고정)

        // 겹침 유형
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

    /** 1) 전개도 문제 생성 (정육면체 고정) */
    function generateOneNetProblem() {
        const p = CubeNets.getRandomPieceProblem();
        return {
            mode: MAIN_MODE.NET_BUILD,
            solid: "cube",
            net: p.net,
            dims: null
        };
    }

    /** 2) 겹침 문제 생성 (정육면체 고정) */
    function generateOneOverlapProblem() {
        const netObj = CubeNets.getRandomOverlapProblem();
        return {
            mode: MAIN_MODE.OVERLAP_FIND,
            solid: "cube",
            net: netObj.net,
            dims: null,
            overlapMode: overlapMode
        };
    }

    // ------------------------------------------------------
    // START
    // ------------------------------------------------------
    function startNetProblems() {
        problems = [];
        for (let i = 0; i < problemCount; i++) {
            problems.push(generateOneNetProblem());
        }
        currentIndex = 0;
        showPage("problem-page");
        loadProblem();
    }

    function startOverlapProblems() {
        problems = [];
        for (let i = 0; i < problemCount; i++) {
            problems.push(generateOneOverlapProblem());
        }
        currentIndex = 0;
        showPage("problem-page");
        loadProblem();
    }

    // ------------------------------------------------------
    // LOAD 1 PROBLEM
    // ------------------------------------------------------
    function loadProblem() {

        currentProblem = problems[currentIndex];
        window.CubeProject.currentProblem = currentProblem; 
        
        if (!currentProblem) {
            showResultPage();
            return;
        }

        document.getElementById("btn-next").classList.add("hidden");
        document.getElementById("btn-check").classList.remove("hidden");
        document.getElementById("btn-check").disabled = false; 

        const title = document.getElementById("problem-title");
        const idx = currentIndex + 1;

        if (currentProblem.mode === MAIN_MODE.NET_BUILD) {
            title.textContent = `전개도 완성하기 (${idx}/${problemCount})`;
        } else {
            title.textContent = `겹쳐지는 부분 찾기 (${idx}/${problemCount})`;
        }

        // UI 초기화: 반드시 init → clear 순서
        UI.init(netCanvas);
        UI.clear();

        const opt = {};
        if (currentProblem.mode === MAIN_MODE.NET_BUILD) {
            opt.removeOne = true;
            opt.highlightPositions = true;
        }

        // 전개도 렌더링 (UI 쪽에서 removedFaceId가 설정됨)
        UI.renderNet(currentProblem.net, opt);
        
        // 3D 초기화
        FoldEngine.init(threeCanvas);
        FoldEngine.currentNet = currentProblem.net;

        // 3D 뷰 초기화: 제거된 조각만 제외하고 5조각만 보이도록 처리
        const netFor3D = JSON.parse(JSON.stringify(currentProblem.net));
        
        if (currentProblem.mode === MAIN_MODE.NET_BUILD) {
            const removedId = window.UI.getRemovedFaceId(); 
            const removedFaceIndex = netFor3D.faces.findIndex(f => f.id === removedId);
            
            if (removedFaceIndex !== -1) {
                // 해당 조각을 배열에서 제거 (5조각만 로드)
                netFor3D.faces.splice(removedFaceIndex, 1);
            }
        }
        
        FoldEngine.loadNet(netFor3D);
        FoldEngine.unfoldImmediate(); 
        
        // 겹침 모드라면 Overlap 초기화
        if (currentProblem.mode === MAIN_MODE.OVERLAP_FIND) {
            Overlap.startSelection(currentProblem.net);
            Overlap.currentMode = currentProblem.overlapMode;
        }
    }

    // ------------------------------------------------------
    // ANSWER CHECK / NEXT
    // ------------------------------------------------------
    function bindProblemButtons() {

        document.getElementById("btn-check").addEventListener("click", () => {
            
            document.getElementById("btn-check").disabled = true;

            // 정답 확인 및 FoldEngine 로드
            let correct = false;

            if (currentProblem.mode === MAIN_MODE.NET_BUILD) {
                // UI.checkPieceResult 내부에서 netClone(정답 포함)을 FoldEngine에 로드
                correct = UI.checkPieceResult(currentProblem.net);
            } else {
                // 겹침 찾기 모드: 현재 문제 net을 FoldEngine에 로드
                FoldEngine.loadNet(currentProblem.net);
                correct = UI.checkOverlapResult(currentProblem.net);
            }

            // 3D 모델을 펼친 상태에서 접는 애니메이션 실행
            FoldEngine.unfoldImmediate(); 
            
            // 오답 시에도 접힘 애니메이션 실행 (학습 효과)
            FoldEngine.foldAnimate(1) 
                .then(() => {
                    if (correct) {
                        alert("정답입니다! 🎉");
                        document.getElementById("btn-check").classList.add("hidden");
                        document.getElementById("btn-next").classList.remove("hidden");
                    } else {
                        alert("틀렸습니다. 다시 생각해 볼까요? 🤔");
                        
                        document.getElementById("btn-check").disabled = false; 
                        
                        // 오답 시: 잠시 후 다시 펼쳐서 사용자가 재시도할 수 있도록 함
                        setTimeout(() => {
                            FoldEngine.unfoldImmediate();
                            
                            if (currentProblem.mode === MAIN_MODE.OVERLAP_FIND) {
                                // 겹침 문제는 선택 초기화 후 UI 렌더링
                                Overlap.startSelection(currentProblem.net);
                                UI.renderNet(currentProblem.net, {}); 
                            } else {
                                // 전개도 완성하기는 5조각만 다시 보이도록 FoldEngine 재로드
                                loadProblem(); // loadProblem()을 호출하여 5조각 상태로 재설정
                            }
                        }, 1500); // 1.5초 후 펼치기
                    }
                })
                .catch(err => {
                    console.error("Fold Animation Error:", err);
                    alert("정답 확인 중 오류가 발생했습니다.");
                    document.getElementById("btn-check").disabled = false;
                });
        });

        document.getElementById("btn-next").addEventListener("click", () => {
            currentIndex++;
            if (currentIndex >= problemCount) {
                showResultPage();
            } else {
                loadProblem();
            }
        });

        document.getElementById("btn-exit").addEventListener("click", () => {
            if (confirm("처음 화면으로 돌아갈까요?")) {
                showPage("mode-select-page");
            }
        });
    }

    // ------------------------------------------------------
    // RESULT PAGE
    // ------------------------------------------------------
    function showResultPage() {
        showPage("result-page");
        document.getElementById("result-acc").textContent =
            `${((currentIndex / problemCount) * 100).toFixed(1)}%`;

        document.getElementById("btn-restart").onclick = () => {
            showPage("mode-select-page");
        };
    }

    // ------------------------------------------------------
    // QR POPUP
    // ------------------------------------------------------
    function bindQRPopup() {
        document.getElementById("qr-btn").addEventListener("click", () => {
            document.getElementById("qr-popup").style.display = "flex";
            const holder = document.getElementById("qr-holder");
            holder.innerHTML = "";
            new QRCode(holder, {
                text: "https://cube.3arch2nd.site",
                width: 180,
                height: 180
            });
        });

        document.getElementById("qr-close").addEventListener("click", () => {
            document.getElementById("qr-popup").style.display = "none";
        });
    }

})();
