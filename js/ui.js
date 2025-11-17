/**
 * ui.js – Cube + Rectangular Prism 전개도 완전 지원 버전
 */

(function () {
    "use strict";

    const UI = {};
    window.UI = UI;

    // 상태
    let canvas = null;
    let ctx = null;

    let currentNet = null;
    let removedFaceId = null;
    let candidatePositions = [];     // {u,v, w, h} - 유효한 배치 위치
    let placed = null;

    const UNIT = 60; // 한 칸 크기
    const EPS = 1e-6;

    // --------------------------------------
    // 초기화
    // --------------------------------------
    UI.init = function (canvasElement) {
        canvas = canvasElement;
        ctx = canvas.getContext("2d");
        
        // 이전에 등록된 이벤트 리스너 제거 (문제 로드 시마다 초기화되므로 중복 방지)
        canvas.removeEventListener("click", onCanvasClick); 
        canvas.addEventListener("click", onCanvasClick);
    };

    UI.clear = function () {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        currentNet = null;
        removedFaceId = null;
        candidatePositions = [];
        placed = null;
    };

    // --------------------------------------
    // net 렌더링 (w×h 지원)
    // --------------------------------------
    UI.renderNet = function (net, options = {}) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        currentNet = JSON.parse(JSON.stringify(net));
        
        const isNetBuildMode = window.CubeProject && window.CubeProject.currentProblem && 
                               window.CubeProject.currentProblem.mode === window.CubeProject.MAIN_MODE.NET_BUILD;

        if (isNetBuildMode) {
             if (removedFaceId == null) removedFaceId = pickRemovableFace(net);
             
             // 3. 오류 수정: 제거된 면뿐만 아니라 모든 유효한 후보 위치 계산
             computeCandidatePositions(currentNet); 
        }

        // 겹침 문제: 선택된 점/선 하이라이트
        if (!isNetBuildMode) {
            if (window.Overlap && window.Overlap.getSelections) {
                const { first, second } = window.Overlap.getSelections();
                if (first) drawOverlapElement(first, "#ffd966");
                if (second) drawOverlapElement(second, "#ffc107");
            }
        }


        // ① 제거된 face는 그리지 않는다
        for (const f of currentNet.faces) {
            if (f.id !== removedFaceId) {
                drawFace(f, "#eaeaea");   // 원래 면
            }
        }

        // ② 후보 위치만 표시
        if (isNetBuildMode && options.highlightPositions) {
            for (const c of candidatePositions) {
                 // 기존 면과 겹치는 위치는 제외하고 그리기
                if (!isPositionOccupied(c)) {
                    drawFaceOutline(c, "#999", 3, "#f9f9f9"); // 연한 배경 추가
                }
            }
        }

        // ③ 사용자가 클릭하여 배치한 위치 (전개도 완성하기)
        if (placed) {
            drawFaceOutline(placed, "#ffc107", 5); // 노란 강조, 두께 5
        }
    };

    function isPositionOccupied(pos) {
         for (const f of currentNet.faces) {
             // 제거된 면 위치를 제외하고, 기존 면의 위치와 겹치는지 확인
             if (f.id !== removedFaceId && 
                 Math.abs(f.u - pos.u) < EPS && Math.abs(f.v - pos.v) < EPS &&
                 Math.abs(f.w - pos.w) < EPS && Math.abs(f.h - pos.h) < EPS) {
                 return true;
             }
         }
         return false;
    }


    // --------------------------------------
    // face 그리기 – w×h 지원
    // --------------------------------------
    function drawFace(f, fill) {
        const x = f.u * UNIT;
        const y = f.v * UNIT;
        const w = f.w * UNIT;
        const h = f.h * UNIT;

        ctx.save();
        ctx.fillStyle = fill;
        ctx.strokeStyle = "#333";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.rect(x, y, w, h);
        ctx.fill();
        ctx.stroke();
        ctx.restore();
    }

    // outline만
    function drawFaceOutline(f, color, lineWidth = 3, fillColor = 'transparent') {
        const x = f.u * UNIT;
        const y = f.v * UNIT;
        const w = f.w * UNIT;
        const h = f.h * UNIT;

        ctx.save();
        ctx.fillStyle = fillColor; // 연한 배경
        ctx.strokeStyle = color;
        ctx.lineWidth = lineWidth;
        ctx.beginPath();
        ctx.rect(x, y, w, h);
        ctx.fill();
        ctx.stroke();
        ctx.restore();
    }
    
    // --------------------------------------
    // 겹침 문제: 선택된 점/선 그리기
    // --------------------------------------
    function drawOverlapElement(elem, color) {
        if (!elem || !currentNet) return;
        
        ctx.save();
        ctx.fillStyle = color;
        ctx.strokeStyle = color;
        ctx.lineWidth = 5;

        const face = currentNet.faces.find(f => f.id === elem.face);
        if (!face) return;

        if (elem.type === "vertex") {
            // 점: 작은 원으로 표시
            const x = elem.x * UNIT;
            const y = elem.y * UNIT;
            ctx.beginPath();
            ctx.arc(x, y, 7, 0, Math.PI * 2);
            ctx.fill();
        } else if (elem.type === "edge") {
            // 선: 해당 edge를 두껍게 표시
            const edges = getEdges(face);
            const edge = edges[elem.edge];

            // 겹침 판정에 사용된 edge의 (u,v) 좌표
            const u1 = edge.a[0] * UNIT;
            const v1 = edge.a[1] * UNIT;
            const u2 = edge.b[0] * UNIT;
            const v2 = edge.b[1] * UNIT;

            ctx.beginPath();
            ctx.moveTo(u1, v1);
            ctx.lineTo(u2, v2);
            ctx.lineCap = 'round'; // 선 끝을 둥글게
            ctx.stroke();
        }
        ctx.restore();
    }

    // --------------------------------------
    // 제거할 face 선택 (leaf face 기준)
    // --------------------------------------
    function pickRemovableFace(net) {
        // (이전 코드와 동일, 생략)
        const adj = buildAdjacency(net);

        for (let i = 0; i < 6; i++) {
            if (adj[i].length === 1) return i;
        }
        return 0; 
    }

    // --------------------------------------
    // adjacency (정육면체+직육면체 대응)
    // --------------------------------------
    function buildAdjacency(net) {
        // (이전 코드와 동일, 생략)
        const adj = [...Array(6)].map(() => []);
        for (let i = 0; i < net.faces.length; i++) {
            for (let j = i + 1; j < net.faces.length; j++) {
                const fi = net.faces[i];
                const fj = net.faces[j];

                const ei = getEdges(fi);
                const ej = getEdges(fj);

                for (let a = 0; a < 4; a++) {
                    for (let b = 0; b < 4; b++) {
                        if (sameEdge(ei[a], ej[b])) {
                            adj[fi.id].push({ to: fj.id, eA: a, eB: b });
                            adj[fj.id].push({ to: fi.id, eA: b, eB: a });
                        }
                    }
                }
            }
        }
        return adj;
    }

    function getEdges(f) {
        // (이전 코드와 동일, 생략)
        return [
            { a:[f.u, f.v],       b:[f.u + f.w, f.v]        }, // top
            { a:[f.u + f.w, f.v], b:[f.u + f.w, f.v + f.h]  }, // right
            { a:[f.u + f.w, f.v + f.h], b:[f.u, f.v + f.h]  }, // bottom
            { a:[f.u, f.v + f.h], b:[f.u, f.v]              }  // left
        ];
    }

    function sameEdge(e1, e2) {
        // (이전 코드와 동일, 생략)
        return (
            Math.abs(e1.a[0] - e2.b[0]) < EPS &&
            Math.abs(e1.a[1] - e2.b[1]) < EPS &&
            Math.abs(e1.b[0] - e2.a[0]) < EPS &&
            Math.abs(e1.b[1] - e2.a[1]) < EPS
        );
    }

    // --------------------------------------
    // candidatePositions 계산 (모든 유효한 빈 공간)
    // --------------------------------------
    function computeCandidatePositions(net) {
        candidatePositions = [];

        // 제거된 면의 크기를 가져옴 (이 조각이 채워져야 하므로)
        const removedFace = net.faces.find(f => f.id === removedFaceId);
        if (!removedFace) return; 

        // 모든 남아있는 면
        const activeFaces = net.faces.filter(f => f.id !== removedFaceId);

        // 3. 오류 수정: 남아있는 모든 면에 대해, 제거된 면과 크기가 같은 조각이
        // 붙을 수 있는 모든 인접한 위치를 후보로 계산
        for (const parent of activeFaces) {
            const edgesF = getEdges(parent);

            // removedFace의 4개 edge 중 하나를 parent의 4개 edge 중 하나에 붙이는 모든 경우의 수
            for (let eP = 0; eP < 4; eP++) { // parent edge index
                for (let eR = 0; eR < 4; eR++) { // removed edge index

                    // 1. Edge 길이 일치 확인 (Removed 조각의 크기가 parent의 edge와 일치해야 함)
                    const p_edge_len = edgeLength(edgesF[eP]);
                    const r_edge_len = edgeLength(getEdges(removedFace)[eR]);
                    
                    if (Math.abs(p_edge_len - r_edge_len) > EPS) {
                        continue; // 길이 불일치
                    }

                    // 2. 배치 좌표 계산
                    const pos = computePlacementByAttachment(parent, removedFace, eP, eR);
                    
                    if (pos) {
                        // 3. 중복 확인 후 추가
                        const isDuplicate = candidatePositions.some(c => 
                            Math.abs(c.u - pos.u) < EPS && Math.abs(c.v - pos.v) < EPS);
                        
                        if (!isDuplicate) {
                            candidatePositions.push(pos);
                        }
                    }
                }
            }
        }
    }
    
    function edgeLength(edge) {
        const [x1, y1] = edge.a;
        const [x2, y2] = edge.b;
        const dx = x2 - x1;
        const dy = y2 - y1;
        return Math.sqrt(dx*dx + dy*dy);
    }

    // --------------------------------------
    // 실제 배치 좌표 계산 (인접 Edge 기준으로)
    // --------------------------------------
    function computePlacementByAttachment(parent, removed, eP, eR) {
        // parent의 eP edge에, removed의 eR edge를 붙이는 경우, removed의 (u,v) 좌표 계산

        const pEdges = getEdges(parent);
        const rEdges = getEdges(removed);

        // removed 조각을 펼쳐진 상태로 가정하고,
        // parent.eP.start에 removed.eR.end가 오고, parent.eP.end에 removed.eR.start가 오도록
        
        // 1. parent의 eP edge 시작점 (A)과 끝점 (B)
        const pA = pEdges[eP].a;
        const pB = pEdges[eP].b;

        // 2. removed 조각을 현재 parent에 붙이는 데 필요한 변환 (회전/이동)을 계산해야 함.
        // 이는 복잡하므로, 가장 단순한 Grid 기반 이동을 사용합니다.
        
        let ru, rv;

        // removed의 eR edge의 (u,v)를 기준으로, removed의 좌상단 (u,v) 좌표를 계산
        // 이 로직은 정육면체(w=h=1)의 십자형 전개도에서는 잘 작동했으나,
        // 직육면체 및 다양한 레이아웃에서는 복잡한 기하학적 변환이 필요합니다.
        
        // 단순화된 그리드 이동만 허용합니다 (직육면체 전개도 타입 1~6을 가정)
        switch (eP) {
            case 0: // Parent Top: removed는 위에 붙음
                rv = parent.v - removed.h;
                ru = parent.u + (pEdges[eP].a[0] - rEdges[eR].b[0]); // u좌표 조정 (단순화된 이동)
                break;
            case 1: // Parent Right: removed는 오른쪽에 붙음
                ru = parent.u + parent.w;
                rv = parent.v + (pEdges[eP].a[1] - rEdges[eR].b[1]); // v좌표 조정 (단순화된 이동)
                break;
            case 2: // Parent Bottom: removed는 아래에 붙음
                rv = parent.v + parent.h;
                ru = parent.u + (pEdges[eP].a[0] - rEdges[eR].b[0]); // u좌표 조정 (단순화된 이동)
                break;
            case 3: // Parent Left: removed는 왼쪽에 붙음
                ru = parent.u - removed.w;
                rv = parent.v + (pEdges[eP].a[1] - rEdges[eR].b[1]); // v좌표 조정 (단순화된 이동)
                break;
            default: return null;
        }

        // 현재 구현에서는 회전 변환을 고려하지 않은 단순 이동만 계산합니다.
        // 실제 전개도 문제에서는 removedFace가 회전하지 않은 상태로 가정되므로,
        // 이 로직은 Grid 기반 정배치에서는 충분합니다.
        
        // 최종적으로 removedFace의 (u,v) 좌표를 반환
        return { 
            u: ru, 
            v: rv, 
            w: removed.w, 
            h: removed.h 
        };
    }

    // --------------------------------------
    // 클릭 → placed 적용
    // --------------------------------------
    function onCanvasClick(evt) {
        const rect = canvas.getBoundingClientRect();
        const x = evt.clientX - rect.left;
        const y = evt.clientY - rect.top;

        const u = x / UNIT;
        const v = y / UNIT;

        if (!currentNet || !window.CubeProject || !window.CubeProject.currentProblem) return;

        // 전개도 완성하기 모드: placed 업데이트
        if (window.CubeProject.currentProblem.mode === window.CubeProject.MAIN_MODE.NET_BUILD) {
             if (removedFaceId == null) return; 

             for (const pos of candidatePositions) {
                 // **3. 오류 수정:** 후보 영역을 클릭했는지 확인
                if (u >= pos.u && u <= pos.u + pos.w && v >= pos.v && v <= pos.v + pos.h) {
                    
                    // 기존 면이 있는 위치를 다시 선택하는 것은 허용하지 않음
                    if (isPositionOccupied(pos)) return; 
                    
                    placed = pos;
                    UI.renderNet(currentNet, { removeOne: true, highlightPositions: true });
                    return;
                }
            }
        }
        
        // 겹침 찾기 모드: Overlap.js에 선택 위임
        else if (window.CubeProject.currentProblem.mode === window.CubeProject.MAIN_MODE.OVERLAP_FIND) {
            const result = window.Overlap.recordClick(u, v);
            if (result) {
                UI.renderNet(currentNet, {}); // 선택 하이라이트 위해 재렌더링
                return;
            }
        }
    }

    // --------------------------------------
    // 정답 판정 (validator 연결)
    // --------------------------------------
    UI.checkPieceResult = function (net) {
        if (!placed) return false;

        const netClone = JSON.parse(JSON.stringify(net));
        const f = netClone.faces.find(f => f.id === removedFaceId);
        
        // placed 위치를 복제본에 적용
        f.u = placed.u;
        f.v = placed.v;
        
        const result = Validator.validateNet(netClone);
        
        // 정답/오답 모두 placed 상태는 유지하여 UI에 표시 (main.js에서 clear 처리)
        return result;
    };

    // overlap 모드는 Overlap.js에서 처리
    UI.checkOverlapResult = function (net) {
        // Overlap.js는 내부적으로 FoldEngine을 사용하므로 net만 넘기면 됨
        return window.Overlap.checkUserAnswer(net);
    };

})();
