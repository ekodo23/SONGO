(function() {
    // ---------- CONSTANTES ----------
    const TOTAL_PITS = 14;
    const INITIAL_SEEDS = 5;
    const WIN_THRESHOLD = 40;

    // Index des camps (Sud = 0, Nord = 1)
    const SOUTH = 0;
    const NORTH = 1;

    // Pits appartenant à chaque joueur
    const playerPits = [
        [0, 1, 2, 3, 4, 5, 6],          // Sud (bas)
        [13, 12, 11, 10, 9, 8, 7]       // Nord (haut)
    ];

    // Successeur anti‑horaire (sens du semis)
    const nextPit = [
        1, 2, 3, 4, 5, 6, 13,           // suite de 0..6
        0, 7, 8, 9, 10, 11, 12           // suite de 7..13
    ];

    // Prédécesseur (sens horaire, utilisé pour la chaîne de capture)
    const prevPit = new Array(TOTAL_PITS);
    for (let i = 0; i < TOTAL_PITS; i++) {
        prevPit[nextPit[i]] = i;
    }

    // Case protégée adverse (première case rencontrée en semant)
    const protectedPit = [
        13,   // pour Sud, c'est la case 13 (première case Nord)
        0     // pour Nord, c'est la case 0 (première case Sud)
    ];

    // ---------- ÉTAT GLOBAL ----------
    let pits = [];
    let captured = [0, 0];
    let currentPlayer = SOUTH;
    let gameOver = false;
    let winnerMessage = '';

    // Éléments DOM
    const boardEl = document.getElementById('board');
    const capturedSouthEl = document.getElementById('capturedSouth');
    const capturedNorthEl = document.getElementById('capturedNorth');
    const turnIndicatorEl = document.getElementById('turnIndicator');
    const messageEl = document.getElementById('message');
    const resetBtn = document.getElementById('resetBtn');

    // ---------- FONCTIONS UTILITAIRES ----------
    function isOpponentPit(index, player) {
        const opp = (player === SOUTH) ? NORTH : SOUTH;
        return playerPits[opp].includes(index);
    }

    function opponentGrains(pitsArr) {
        const opp = (currentPlayer === SOUTH) ? NORTH : SOUTH;
        return playerPits[opp].reduce((sum, i) => sum + pitsArr[i], 0);
    }

    function totalGrains(pitsArr) {
        return pitsArr.reduce((a, b) => a + b, 0);
    }

    function deepCopyGame() {
        return {
            pits: [...pits],
            captured: [...captured],
            currentPlayer: currentPlayer,
            gameOver: gameOver,
            winnerMessage: winnerMessage
        };
    }

    // ---------- SEMAILLE NORMALE ----------
    function normalSow(pitsArr, start) {
        let seeds = pitsArr[start];
        pitsArr[start] = 0;
        let cur = start;
        while (seeds > 0) {
            cur = nextPit[cur];
            if (cur === start) continue;   // on saute la case de départ
            pitsArr[cur]++;
            seeds--;
        }
        return cur;
    }

    // ---------- SEMAILLE GRENIER (> 13 graines) ----------
    function granarySow(pitsArr, start) {
        let seeds = pitsArr[start];
        pitsArr[start] = 0;
        let cur = start;

        // Tour complet en sautant la case source
        while (seeds > 0) {
            cur = nextPit[cur];
            if (cur === start) continue;
            pitsArr[cur]++;
            seeds--;
            if (cur === start) break; // normalement on ne passe qu'une fois
        }

        // Si des graines restent, on les distribue uniquement dans le camp adverse
        if (seeds > 0) {
            while (seeds > 0) {
                cur = nextPit[cur];
                if (isOpponentPit(cur, currentPlayer)) {
                    pitsArr[cur]++;
                    seeds--;
                }
                // les cases du joueur actif sont ignorées
            }
        }
        return cur; // dernière case alimentée
    }

    // ---------- SIMULATION D'UN COUP COMPLET ----------
    function simulateFullMove(start) {
        const sim = deepCopyGame();
        const pitsCopy = sim.pits;
        const capturedCopy = sim.captured;
        const player = sim.currentPlayer;
        const opponent = (player === SOUTH) ? NORTH : SOUTH;

        // 1. Semis
        const isGranary = pitsCopy[start] > 13;
        const lastIdx = isGranary ? granarySow(pitsCopy, start) : normalSow(pitsCopy, start);

        // 2. Sauvegarde après semis (pour annulation starvation)
        const afterSowPits = [...pitsCopy];

        // 3. Captures potentielles
        let capturedDelta = 0;
        let capturedIndices = [];

        if (isGranary) {
            // Capture spéciale grenier : si dernière graine sur case protégée adverse, on capture cette seule graine
            if (lastIdx === protectedPit[player]) {
                // On capture 1 grain (la dernière graine posée)
                pitsCopy[lastIdx]--;
                capturedDelta = 1;
                capturedIndices.push(lastIdx);
            }
        } else {
            // Capture normale : conditions
            if (isOpponentPit(lastIdx, player) &&
                lastIdx !== protectedPit[player] &&
                (pitsCopy[lastIdx] === 2 || pitsCopy[lastIdx] === 3 || pitsCopy[lastIdx] === 4)) {

                // Capture de la case finale
                capturedDelta += pitsCopy[lastIdx];
                capturedIndices.push(lastIdx);
                pitsCopy[lastIdx] = 0;

                // Chaîne de capture en remontant vers la première case adverse
                let cur = lastIdx;
                while (true) {
                    const prev = prevPit[cur];
                    if (!isOpponentPit(prev, player)) break;
                    if (pitsCopy[prev] === 2 || pitsCopy[prev] === 3 || pitsCopy[prev] === 4) {
                        capturedDelta += pitsCopy[prev];
                        capturedIndices.push(prev);
                        pitsCopy[prev] = 0;
                        cur = prev;
                    } else {
                        break;
                    }
                }
            }
        }

        // 4. Vérification famine (la capture ne doit pas vider le camp adverse)
        const oppGrainsAfterCapture = playerPits[opponent].reduce((sum, i) => sum + pitsCopy[i], 0);
        if (capturedDelta > 0 && oppGrainsAfterCapture === 0) {
            // Annulation de toutes les captures
            for (let i = 0; i < pitsCopy.length; i++) {
                pitsCopy[i] = afterSowPits[i];
            }
            capturedDelta = 0;
            capturedIndices = [];
        }

        // 5. Mise à jour des scores
        capturedCopy[player] += capturedDelta;

        // 6. Vérification victoire
        if (capturedCopy[player] >= WIN_THRESHOLD) {
            sim.gameOver = true;
            sim.winnerMessage = (player === SOUTH ? 'Sud (bas)' : 'Nord (haut)') +
                ` a gagné avec ${capturedCopy[player]} graines !`;
        } else if (totalGrains(pitsCopy) < 10) {
            // Moins de 10 graines sur le plateau -> fin de partie avec ramassage
            sim.gameOver = true;
            const southGrains = playerPits[SOUTH].reduce((s, i) => s + pitsCopy[i], 0);
            const northGrains = playerPits[NORTH].reduce((s, i) => s + pitsCopy[i], 0);
            capturedCopy[SOUTH] += southGrains;
            capturedCopy[NORTH] += northGrains;
            if (capturedCopy[SOUTH] > capturedCopy[NORTH])
                sim.winnerMessage = `Sud gagne avec ${capturedCopy[SOUTH]} graines contre ${capturedCopy[NORTH]}.`;
            else if (capturedCopy[NORTH] > capturedCopy[SOUTH])
                sim.winnerMessage = `Nord gagne avec ${capturedCopy[NORTH]} graines contre ${capturedCopy[SOUTH]}.`;
            else
                sim.winnerMessage = `Match nul ! Chaque joueur a capturé ${capturedCopy[SOUTH]} graines.`;
        } else {
            // Changement de joueur
            sim.currentPlayer = opponent;
        }

        // 7. Retourne l'état simulé et le nombre de graines adverses restantes
        const oppGrains = playerPits[opponent].reduce((s, i) => s + pitsCopy[i], 0);
        return {
            success: true,
            pits: pitsCopy,
            captured: capturedCopy,
            currentPlayer: sim.currentPlayer,
            gameOver: sim.gameOver,
            winnerMessage: sim.winnerMessage,
            opponentGrains: oppGrains,
            lastIndex: lastIdx,
            capturedIndices: capturedIndices
        };
    }

    // ---------- GESTION DE LA SOLIDARITÉ (camp adverse vide) ----------
    function computeFeedingMoves() {
        const opponent = (currentPlayer === SOUTH) ? NORTH : SOUTH;
        // Vérifier que le camp adverse est bien vide
        if (playerPits[opponent].some(i => pits[i] > 0)) return null; // pas de solidarité nécessaire

        const possibleMoves = [];
        const playerIndices = playerPits[currentPlayer];
        for (let idx of playerIndices) {
            if (pits[idx] === 0) continue;
            const sim = simulateFullMove(idx);
            if (sim.success) {
                // On s'intéresse au nombre de graines chez l'adversaire après le coup
                const oppGrains = sim.opponentGrains;
                possibleMoves.push({ pitIndex: idx, opponentGrains: oppGrains });
            }
        }

        if (possibleMoves.length === 0) return null;

        // Priorité 1 : donner au moins 7 graines
        const highFeeding = possibleMoves.filter(m => m.opponentGrains >= 7);
        if (highFeeding.length > 0) {
            return highFeeding.map(m => m.pitIndex); // seules ces cases sont autorisées
        }

        // Priorité 2 : donner le maximum possible
        const maxGrains = Math.max(...possibleMoves.map(m => m.opponentGrains));
        if (maxGrains > 0) {
            return possibleMoves.filter(m => m.opponentGrains === maxGrains).map(m => m.pitIndex);
        }

        // Aucun coup ne nourrit l'adversaire → fin de partie
        return [];
    }

    // ---------- EXÉCUTION DU COUP RÉEL ----------
    function executeMove(start) {
        if (gameOver) return;

        // Vérifier si une solidarité est en cours
        const allowedFeeding = computeFeedingMoves();
        if (allowedFeeding !== null && allowedFeeding.length === 0) {
            // Aucun coup ne nourrit l'adversaire → fin de partie
            endGameEarly();
            return;
        }
        if (allowedFeeding !== null && !allowedFeeding.includes(start)) {
            setMessage("Vous devez nourrir l'adversaire (cases autorisées en surbrillance).", true);
            return;
        }

        // Vérification élémentaire
        if (!playerPits[currentPlayer].includes(start)) {
            setMessage("Ce n'est pas votre camp.", true);
            return;
        }
        if (pits[start] === 0) {
            setMessage("Cette case est vide.", true);
            return;
        }

        // Simulation pour appliquer le coup
        const result = simulateFullMove(start);
        if (!result.success) {
            setMessage("Coup impossible.", true);
            return;
        }

        // Appliquer l'état
        pits = result.pits;
        captured = result.captured;
        currentPlayer = result.currentPlayer;
        gameOver = result.gameOver;
        winnerMessage = result.winnerMessage;
        setMessage('');

        if (gameOver) {
            // Si la partie est finie, on ajoute les graines restantes (règle du ramassage)
            if (!winnerMessage.includes('a gagné avec')) {
                // Fin par moins de 10 graines ou impossibilité de nourrir -> déjà fait dans simulateFullMove
            }
            refreshUI();
            setTimeout(() => {
                window.location.href = `end.html?winner=${encodeURIComponent(winnerMessage)}&score1=${captured[SOUTH]}&score2=${captured[NORTH]}`;
            }, 1500);
        } else {
            refreshUI();
            // Vérifier si le nouveau joueur a un coup possible
            if (playerPits[currentPlayer].every(i => pits[i] === 0)) {
                endGameEarly();
            }
        }
    }

    function endGameEarly() {
        // Ramassage des graines restantes
        const southGrains = playerPits[SOUTH].reduce((s, i) => s + pits[i], 0);
        const northGrains = playerPits[NORTH].reduce((s, i) => s + pits[i], 0);
        captured[SOUTH] += southGrains;
        captured[NORTH] += northGrains;
        if (captured[SOUTH] > captured[NORTH])
            winnerMessage = `Sud gagne avec ${captured[SOUTH]} graines contre ${captured[NORTH]}.`;
        else if (captured[NORTH] > captured[SOUTH])
            winnerMessage = `Nord gagne avec ${captured[NORTH]} graines contre ${captured[SOUTH]}.`;
        else
            winnerMessage = `Match nul ! Chaque joueur a capturé ${captured[SOUTH]} graines.`;
        gameOver = true;
        refreshUI();
        setTimeout(() => {
            window.location.href = `end.html?winner=${encodeURIComponent(winnerMessage)}&score1=${captured[SOUTH]}&score2=${captured[NORTH]}`;
        }, 1500);
    }

    // ---------- AFFICHAGE ----------
    function renderBoard() {
        boardEl.innerHTML = '';

        // Ligne du haut (Nord) : cases 13 à 7 (inversées visuellement)
        const topRow = document.createElement('div');
        topRow.className = 'row top';
        for (let i = 13; i >= 7; i--) {
            topRow.appendChild(createPitElement(i));
        }
        boardEl.appendChild(topRow);

        // Ligne du bas (Sud) : cases 0 à 6
        const bottomRow = document.createElement('div');
        bottomRow.className = 'row bottom';
        for (let i = 0; i <= 6; i++) {
            bottomRow.appendChild(createPitElement(i));
        }
        boardEl.appendChild(bottomRow);
    }

    function createPitElement(index) {
        const seedCount = pits[index];
        const div = document.createElement('div');
        div.className = 'pit';
        div.setAttribute('data-index', index);

        const countSpan = document.createElement('span');
        countSpan.className = 'seed-count';
        countSpan.textContent = seedCount;
        div.appendChild(countSpan);

        const icons = document.createElement('span');
        icons.className = 'seed-icons';
        icons.textContent = '●'.repeat(Math.min(seedCount, 15));
        div.appendChild(icons);

        // Déterminer le statut de la case
        const isCurrentPlayerPit = playerPits[currentPlayer].includes(index);
        const allowedFeeding = computeFeedingMoves(); // peut être null si pas de solidarité

        if (!gameOver && isCurrentPlayerPit && seedCount > 0) {
            // Solidarité : seules certaines cases sont autorisées
            if (allowedFeeding !== null) {
                if (allowedFeeding.includes(index)) {
                    div.classList.add('feeding-only');   // case obligatoire pour nourrir
                } else {
                    div.classList.add('empty');           // case interdite
                }
            } else {
                div.classList.add('active-player');       // case jouable normalement
            }
            if (!div.classList.contains('empty')) {
                div.addEventListener('click', () => executeMove(index));
            }
        } else if (!gameOver && isCurrentPlayerPit && seedCount === 0) {
            div.classList.add('empty');
        } else if (!gameOver && !isCurrentPlayerPit) {
            div.classList.add('empty-opponent');
        }

        return div;
    }

    function updateScores() {
        capturedSouthEl.textContent = captured[SOUTH];
        capturedNorthEl.textContent = captured[NORTH];
    }

    function updateTurnIndicator() {
        if (gameOver) {
            turnIndicatorEl.textContent = winnerMessage || 'Partie terminée';
            turnIndicatorEl.style.background = '#e0a800';
        } else {
            const name = currentPlayer === SOUTH ? 'Sud (bas)' : 'Nord (haut)';
            turnIndicatorEl.textContent = `C'est au tour de ${name}`;
            turnIndicatorEl.style.background = '#ffd700';
        }
    }

    function setMessage(text, isError = false) {
        messageEl.textContent = text;
        messageEl.style.color = isError ? '#ffb0b0' : '#fff7d6';
    }

    function refreshUI() {
        renderBoard();
        updateScores();
        updateTurnIndicator();
    }

    function resetGame() {
        pits = Array(TOTAL_PITS).fill(INITIAL_SEEDS);
        captured = [0, 0];
        currentPlayer = SOUTH;
        gameOver = false;
        winnerMessage = '';
        setMessage('');
        refreshUI();
    }

    // ---------- INITIALISATION ----------
    resetBtn.addEventListener('click', resetGame);
    resetGame();
})();
