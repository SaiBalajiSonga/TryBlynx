$status = git status --porcelain
foreach ($line in $status) {
    $file = $line.Substring(3)
    if ($file) {
        git add "$file"
        $basename = Split-Path $file -Leaf
        git commit -m "refactor: update $basename"
    }
}
git push origin main
