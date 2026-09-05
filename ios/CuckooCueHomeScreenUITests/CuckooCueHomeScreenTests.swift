import XCTest

final class CuckooCueHomeScreenTests: XCTestCase {
    func testAddMediumWidgetToHomeScreen() throws {
        let app = XCUIApplication()
        app.launchArguments = ["--ui-testing"]
        app.launch()
        XCTAssertTrue(app.navigationBars["Cuckoo Cue"].waitForExistence(timeout: 8))

        XCUIDevice.shared.press(.home)
        let springboard = XCUIApplication(bundleIdentifier: "com.apple.springboard")
        let icon = springboard.icons["Cuckoo Cue"]
        XCTAssertTrue(icon.waitForExistence(timeout: 8))
        icon.press(forDuration: 1.5)

        let editButton = springboard.buttons["Edit Home Screen"]
        XCTAssertTrue(editButton.waitForExistence(timeout: 5))
        editButton.tap()

        let editMenuButton = springboard.buttons["Edit"]
        XCTAssertTrue(editMenuButton.waitForExistence(timeout: 5))
        editMenuButton.tap()

        let addWidgetMenuButton = springboard.buttons["Add Widget"]
        XCTAssertTrue(addWidgetMenuButton.waitForExistence(timeout: 5))
        addWidgetMenuButton.tap()

        let searchField = springboard.searchFields["Search Widgets"]
        XCTAssertTrue(searchField.waitForExistence(timeout: 8))
        searchField.tap()
        searchField.typeText("Cuckoo Cue")

        let widgetResult = springboard.cells
            .containing(.staticText, identifier: "Cuckoo Cue")
            .firstMatch
        XCTAssertTrue(widgetResult.waitForExistence(timeout: 8))
        widgetResult.tap()

        let addWidgetButton = springboard.buttons["Add Widget"]
        XCTAssertTrue(addWidgetButton.waitForExistence(timeout: 8))
        addWidgetButton.tap()

        let doneButton = springboard.buttons["Done"]
        if doneButton.waitForExistence(timeout: 4) { doneButton.tap() }

        let screenshot = XCTAttachment(screenshot: springboard.screenshot())
        screenshot.name = "CuckooCue-Widget-Actual-Home-Screen"
        screenshot.lifetime = .keepAlways
        add(screenshot)
    }
}
