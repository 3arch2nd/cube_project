/**
 * cube_nets.js
 *
 *  - 정육면체 전개도(6칸짜리 육소미노) 패턴 11개를 정의
 *  - 각 패턴은 격자 좌표(u, v)와 인접 정보(adjacency)를 가짐
 *  - 다른 스크립트에서 window.CubeNets 로 접근
 *
 *  좌표 규칙:
 *    - 각 칸은 1x1 정사각형
 *    - (u, v)는 전개도의 격자 위치 (0 이상 정수)
 *    - 인접 조건: |Δu| + |Δv| === 1 이면 한 변을 공유하는 이웃
 *
 *  구조:
 *    CubeNets.nets         : 모든 전개도 배열
 *    CubeNets.getRandomNet(): 무작위 전개도 하나 반환(깊은 복사)
 *    CubeNets.getNetById(id)
 *    CubeNets.cloneNet(net)
 *    CubeNets.normalizeNet(net) : 회전/대칭 비교용 정규화 키 생성
 */

(function () {
    'use strict';

    /**
     * 1단계: “칸 좌표만” 가진 러프 데이터
     *  - 나중에 faces / adjacency 로 가공한다.
     *  - 여기서 정의한 11개가 우리 앱에서 사용하는 “정육면체 전개도 패턴 11종”이 됨
     *
     *  NOTE:
     *   - 수학적으로 공식 “정육면체 넷 11종”과 회전/대칭 관점에서
     *     1:1 대응일 필요는 없고,
     *     “정육면체로 접힐 수 있는 전개도 11개”라는 교육적 의미로 활용하면 충분함.
     *   - 전개도 모양이 마음에 안 들면, 이 배열만 수정하면 됨.
     */
    const RAW_NETS = [
        {
            id: 'net01',
            label: '패턴 1',
            // [(u, v), ...]
            cells: [
                [0, 1],
                [1, 0],
                [1, 1],
                [1, 2],
                [2, 1],
                [3, 1]
            ]
        },
        {
            id: 'net02',
            label: '패턴 2',
            cells: [
                [0, 1],
                [1, 0],
                [1, 1],
                [1, 2],
                [1, 3],
                [2, 1]
            ]
        },
        {
            id: 'net03',
            label: '패턴 3',
            cells: [
                [0, 0],
                [1, 0],
                [2, 0],
                [2, 1],
                [3, 1],
                [3, 2]
            ]
        },
        {
            id: 'net04',
            label: '패턴 4',
            cells: [
                [0, 1],
                [1, 1],
                [2, 0],
                [2, 1],
                [2, 2],
                [3, 0]
            ]
        },
        {
            id: 'net05',
            label: '패턴 5',
            cells: [
                [0, 1],
                [1, 0],
                [1, 1],
                [2, 1],
                [2, 2],
                [3, 1]
            ]
        },
        {
            id: 'net06',
            label: '패턴 6',
            cells: [
                [0, 0],
                [1, 0],
                [2, 0],
                [2, 1],
                [2, 2],
                [3, 2]
            ]
        },
        {
            id: 'net07',
            label: '패턴 7',
            cells: [
                [0, 0],
                [1, 0],
                [1, 1],
                [2, 1],
                [2, 2],
                [3, 2]
            ]
        },
        {
            id: 'net08',
            label: '패턴 8',
            cells: [
                [0, 0],
                [0, 1],
                [1, 1],
                [1, 2],
                [2, 2],
                [3, 2]
            ]
        },
        {
            id: 'net09',
            label: '패턴 9',
            cells: [
                [0, 2],
                [1, 1],
                [1, 2],
                [2, 0],
                [2, 1],
                [3, 0]
            ]
        },
        {
            id: 'net10',
            label: '패턴 10',
            cells: [
                [0, 1],
                [1, 1],
                [2, 0],
                [2, 1],
                [2, 2],
                [3, 2]
            ]
        },
        {
            id: 'net11',
            label: '패턴 11',
            cells: [
                [0, 1],
                [1, 1],
                [2, 1],
                [2, 2],
                [3, 0],
                [3, 1]
            ]
        }
    ];

    /**
     * 작은 유틸: 깊은 복사
     */
    function deepClone(obj) {
        return JSON.parse(JSON.stringify(obj));
    }

    /**
     * faces 배열과 adjacency 배열을 만드는 헬퍼
     *
     * faces: { id, u, v }
     * adjacency: { from, to, dir }
     *  - dir: 'up' | 'down' | 'left' | 'right'
     */
    function buildNetFromCells(rawNet) {
        const faces = rawNet.cells.map(([u, v], idx) => ({
            id: idx,
            u,
            v
        }));

        const adjacency = [];

        // 인접한 두 face 찾기
        for (let i = 0; i < faces.length; i++) {
            for (let j = i + 1; j < faces.length; j++) {
                const a = faces[i];
                const b = faces[j];
                const du = b.u - a.u;
                const dv = b.v - a.v;
                const manhattan = Math.abs(du) + Math.abs(dv);

                if (manhattan === 1) {
                    let dirAB, dirBA;
                    if (du === 1 && dv === 0) {
                        dirAB = 'right';
                        dirBA = 'left';
                    } else if (du === -1 && dv === 0) {
                        dirAB = 'left';
                        dirBA = 'right';
                    } else if (du === 0 && dv === 1) {
                        dirAB = 'down';
                        dirBA = 'up';
                    } else if (du === 0 && dv === -1) {
                        dirAB = 'up';
                        dirBA = 'down';
                    }

                    adjacency.push({
                        from: a.id,
                        to: b.id,
                        dir: dirAB
                    });
                    adjacency.push({
                        from: b.id,
                        to: a.id,
                        dir: dirBA
                    });
                }
            }
        }

        return {
            id: rawNet.id,
            label: rawNet.label,
            faces,
            adjacency
        };
    }

    /**
     * 전개도 회전/대칭 비교용 정규화:
     *  - 나중에 “학생이 만든 전개도 모양이 11개 중 하나와 같은가?”를
     *    체크할 때 쓸 수 있도록, 형태를 대표키(문자열)로 만든다.
     *
     *  여기서는:
     *    1) faces의 (u, v)를 기준으로
     *    2) 90도 회전 4가지 × 상하반전 2가지 = 최대 8가지 형태를 만들어 보고
     *    3) 각 형태를 (min u, min v) 기준으로 (0,0)으로 평행이동한 뒤
     *    4) 정렬 후 문자열로 만들고
     *    5) 그 중 사전순으로 가장 앞서는 걸 대표키로 사용
     */
    function normalizeNet(net) {
        const cells = net.faces.map(f => [f.u, f.v]);

        function normalizeCells(cellsArr) {
            const xs = cellsArr.map(c => c[0]);
            const ys = cellsArr.map(c => c[1]);
            const minX = Math.min(...xs);
            const minY = Math.min(...ys);
            const shifted = cellsArr.map(([x, y]) => [x - minX, y - minY]);
            shifted.sort((a, b) => (a[0] - b[0]) || (a[1] - b[1]));
            return shifted;
        }

        function rotate90([x, y]) {
            // (x, y) -> (-y, x)
            return [-y, x];
        }

        function allSymmetries(cellsArr) {
            const variants = [];
            for (let rot = 0; rot < 4; rot++) {
                let rotated = cellsArr.map(c => c);
                for (let r = 0; r < rot; r++) {
                    rotated = rotated.map(rotate90);
                }

                // 원본 + 상하반전 두 가지
                const normal = normalizeCells(rotated);
                const flipped = normalizeCells(rotated.map(([x, y]) => [x, -y]));
                variants.push(normal);
                variants.push(flipped);
            }

            // 중복 제거
            const uniq = [];
            const seen = new Set();
            for (const v of variants) {
                const key = JSON.stringify(v);
                if (!seen.has(key)) {
                    seen.add(key);
                    uniq.push(v);
                }
            }
            return uniq;
        }

        const variantCells = allSymmetries(cells);
        const keys = variantCells.map(v => JSON.stringify(v));
        keys.sort(); // 사전순 최소 선택

        return keys[0];
    }

    /**
     * 외부에서 쓸 수 있는 API 모음
     */
    const nets = RAW_NETS.map(buildNetFromCells);

    // id -> net 빠른 검색용
    const netById = {};
    nets.forEach(net => {
        netById[net.id] = net;
        // 미리 normalizeKey도 만들어 두면, 나중에 비교용으로 편리
        net.normalizeKey = normalizeNet(net);
    });

    function getRandomNet() {
        const idx = Math.floor(Math.random() * nets.length);
        return deepClone(nets[idx]);
    }

    function getNetById(id) {
        const base = netById[id];
        return base ? deepClone(base) : null;
    }

    function cloneNet(net) {
        return deepClone(net);
    }

    // window 전역 네임스페이스에 export
    window.CubeNets = {
        nets,
        getRandomNet,
        getNetById,
        cloneNet,
        normalizeNet
    };
})();
