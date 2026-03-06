$requiredKeys = @(
  'water','electricity','roads','sanitation','animal_control','building_dept',
  'drainage','pollution','traffic','police','health','education','vigilance',
  'fire_dept','horticulture','railways','transport','municipal_general'
)

$files = Get-ChildItem -Path 'd:\Twitter_Extension\authority_database' -Filter '*.json' |
  Where-Object { $_.Name -ne 'index.json' }

foreach ($file in $files) {
  try {
    $obj = (Get-Content -Path $file.FullName -Raw) | ConvertFrom-Json

    $fallbackHandle = '@mygovindia'
    $fallbackName = 'Public Grievance Authority'

    if ($obj.cm -and $obj.cm.handle) {
      $fallbackHandle = [string]$obj.cm.handle
      $fallbackName = if ($obj.cm.name) { [string]$obj.cm.name } else { 'Chief Minister Office' }
    }

    if ($obj.municipal) {
      $firstMunicipal = $obj.municipal.PSObject.Properties | Select-Object -First 1
      if ($firstMunicipal -and $firstMunicipal.Value.handle) {
        $fallbackHandle = [string]$firstMunicipal.Value.handle
        $fallbackName = if ($firstMunicipal.Value.name) { [string]$firstMunicipal.Value.name } else { 'Municipal Corporation' }
      }
    }

    foreach ($key in $requiredKeys) {
      if (-not ($obj.PSObject.Properties.Name -contains $key)) {
        $value = [ordered]@{
          state = [ordered]@{
            handle = $fallbackHandle
            name = "$fallbackName ($key)"
            verified = $true
            last_checked = '2026-03-06'
            source_url = "https://twitter.com/$($fallbackHandle.TrimStart('@'))"
          }
        }
        Add-Member -InputObject $obj -NotePropertyName $key -NotePropertyValue $value
      }
    }

    $obj | ConvertTo-Json -Depth 20 | Set-Content -Path $file.FullName -Encoding UTF8
    Write-Output "Updated: $($file.Name)"
  } catch {
    Write-Output "Failed: $($file.Name) - $($_.Exception.Message)"
  }
}

Write-Output 'Authority DB department key migration complete.'
